-- SES Navigator
-- Migration: 146_accounting_export_batches
-- Purpose: Generate balanced journal-entry batches from fully closed periods
--          and record controlled export completion.

begin;

create table app.accounting_export_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  accounting_period_id uuid not null,
  version_no integer not null,
  export_format text not null default 'generic_csv'
    check (export_format in ('generic_csv', 'freee', 'money_forward', 'yayoi')),
  status text not null default 'generated'
    check (status in ('generated', 'exported', 'cancelled')),
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id) on delete set null,
  exported_at timestamptz,
  exported_by uuid references auth.users(id) on delete set null,
  export_reference text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, accounting_period_id, version_no),
  foreign key (tenant_id, accounting_period_id)
    references app.accounting_periods(tenant_id, id) on delete restrict,
  check ((status = 'exported') = (exported_at is not null)),
  check (export_reference is null or length(export_reference) <= 1000)
);

create table app.accounting_export_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  export_batch_id uuid not null,
  line_no integer not null,
  entry_date date not null,
  account_code varchar(40) not null,
  account_name varchar(200) not null,
  debit_amount numeric(14,2) not null default 0,
  credit_amount numeric(14,2) not null default 0,
  currency char(3) not null default 'JPY',
  description text not null,
  source_type text not null check (source_type in ('invoice', 'payment')),
  source_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, export_batch_id, line_no),
  foreign key (tenant_id, export_batch_id)
    references app.accounting_export_batches(tenant_id, id) on delete cascade,
  check (debit_amount >= 0 and credit_amount >= 0),
  check ((debit_amount > 0) <> (credit_amount > 0))
);

create index accounting_export_batches_period_idx
  on app.accounting_export_batches(
    tenant_id, accounting_period_id, version_no desc
  );
create index accounting_export_lines_batch_idx
  on app.accounting_export_lines(tenant_id, export_batch_id, line_no);

select app.attach_updated_at_trigger('app.accounting_export_batches'::regclass);
select app.attach_row_version_trigger('app.accounting_export_batches'::regclass);

alter table app.accounting_export_batches enable row level security;
alter table app.accounting_export_batches force row level security;
create policy authorization_select on app.accounting_export_batches
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_permission('finance.read')
  );
create policy authorization_insert on app.accounting_export_batches
  for insert to authenticated
  with check (
    tenant_id = app.current_tenant_id()
    and created_by = auth.uid()
    and app.has_permission('finance.manage')
  );
create policy authorization_update on app.accounting_export_batches
  for update to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_permission('finance.manage')
  )
  with check (
    tenant_id = app.current_tenant_id()
    and app.has_permission('finance.manage')
  );

alter table app.accounting_export_lines enable row level security;
alter table app.accounting_export_lines force row level security;
create policy authorization_select on app.accounting_export_lines
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_permission('finance.read')
  );
create policy authorization_insert on app.accounting_export_lines
  for insert to authenticated
  with check (
    tenant_id = app.current_tenant_id()
    and app.has_permission('finance.manage')
  );

create or replace function public.list_accounting_export_batches(
  p_accounting_period_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  result jsonb;
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('finance.read')
     or p_limit is null or p_limit < 1 or p_limit > 200
  then
    raise exception 'invalid accounting export list request' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(batch_row) order by batch_row.generated_at desc), '[]'::jsonb)
  ) into result
  from (
    select
      b.id,
      b.accounting_period_id,
      p.period_month,
      b.version_no,
      b.export_format,
      b.status,
      b.generated_at,
      b.exported_at,
      b.export_reference,
      count(l.id)::integer as line_count,
      coalesce(sum(l.debit_amount), 0) as debit_total,
      coalesce(sum(l.credit_amount), 0) as credit_total,
      b.updated_at,
      b.row_version
    from app.accounting_export_batches b
    join app.accounting_periods p
      on p.tenant_id = b.tenant_id and p.id = b.accounting_period_id
    left join app.accounting_export_lines l
      on l.tenant_id = b.tenant_id and l.export_batch_id = b.id
    where b.tenant_id = tenant
      and (p_accounting_period_id is null or b.accounting_period_id = p_accounting_period_id)
    group by b.id, p.period_month
    order by b.generated_at desc
    limit p_limit
  ) batch_row;
  return result;
end
$$;

create or replace function public.get_accounting_export_batch_detail(
  p_export_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  result jsonb;
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('finance.read')
     or p_export_batch_id is null
  then
    raise exception 'invalid accounting export detail request' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'id', b.id,
    'accounting_period_id', b.accounting_period_id,
    'period_month', p.period_month,
    'version_no', b.version_no,
    'export_format', b.export_format,
    'status', b.status,
    'generated_at', b.generated_at,
    'exported_at', b.exported_at,
    'export_reference', b.export_reference,
    'line_count', count(l.id)::integer,
    'debit_total', coalesce(sum(l.debit_amount), 0),
    'credit_total', coalesce(sum(l.credit_amount), 0),
    'updated_at', b.updated_at,
    'row_version', b.row_version,
    'lines', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'line_no', l.line_no,
        'entry_date', l.entry_date,
        'account_code', l.account_code,
        'account_name', l.account_name,
        'debit_amount', l.debit_amount,
        'credit_amount', l.credit_amount,
        'currency', l.currency,
        'description', l.description,
        'source_type', l.source_type,
        'source_id', l.source_id
      ) order by l.line_no
    ) filter (where l.id is not null), '[]'::jsonb)
  ) into result
  from app.accounting_export_batches b
  join app.accounting_periods p
    on p.tenant_id = b.tenant_id and p.id = b.accounting_period_id
  left join app.accounting_export_lines l
    on l.tenant_id = b.tenant_id and l.export_batch_id = b.id
  where b.tenant_id = tenant and b.id = p_export_batch_id
  group by b.id, p.period_month;
  return result;
end
$$;

create or replace function public.generate_accounting_export_batch(
  p_accounting_period_id uuid,
  p_export_format text default 'generic_csv',
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  period app.accounting_periods%rowtype;
  batch app.accounting_export_batches%rowtype;
  next_version integer;
  debit_total numeric(14,2);
  credit_total numeric(14,2);
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('finance.manage')
     or p_accounting_period_id is null
     or p_export_format is null
     or p_export_format not in ('generic_csv', 'freee', 'money_forward', 'yayoi')
  then
    raise exception 'invalid accounting export generation request' using errcode = '22023';
  end if;

  select p.* into period from app.accounting_periods p
  where p.tenant_id = tenant and p.id = p_accounting_period_id
  for update;
  if not found
     or period.sales_status <> 'closed'
     or period.invoice_status <> 'closed'
     or period.payment_status <> 'closed'
  then return null; end if;

  select coalesce(max(b.version_no), 0) + 1 into next_version
  from app.accounting_export_batches b
  where b.tenant_id = tenant and b.accounting_period_id = period.id;

  insert into app.accounting_export_batches(
    tenant_id, accounting_period_id, version_no, export_format,
    generated_by, created_by, updated_by
  ) values (
    tenant, period.id, next_version, p_export_format,
    auth.uid(), auth.uid(), auth.uid()
  ) returning * into batch;

  with source_lines as (
    select i.issue_date entry_date, '1100' account_code,
      '売掛金' account_name, i.total_amount debit_amount, 0::numeric credit_amount,
      i.currency, i.invoice_no || ' 売上請求' description,
      'invoice' source_type, i.id source_id, 1 sort_no
    from app.invoices i
    where i.tenant_id = tenant and i.deleted_at is null and i.invoice_type = 'sales'
      and date_trunc('month', coalesce(i.billing_period_start, i.issue_date))::date = period.period_month
      and i.status in ('issued', 'sent', 'partially_paid', 'paid', 'overdue')
    union all
    select i.issue_date, '4000', '売上高', 0, i.subtotal, i.currency,
      i.invoice_no || ' 売上請求', 'invoice', i.id, 2
    from app.invoices i
    where i.tenant_id = tenant and i.deleted_at is null and i.invoice_type = 'sales'
      and date_trunc('month', coalesce(i.billing_period_start, i.issue_date))::date = period.period_month
      and i.status in ('issued', 'sent', 'partially_paid', 'paid', 'overdue')
      and i.subtotal > 0
    union all
    select i.issue_date, '2100', '仮受消費税', 0, i.tax_amount, i.currency,
      i.invoice_no || ' 売上請求', 'invoice', i.id, 3
    from app.invoices i
    where i.tenant_id = tenant and i.deleted_at is null and i.invoice_type = 'sales'
      and date_trunc('month', coalesce(i.billing_period_start, i.issue_date))::date = period.period_month
      and i.status in ('issued', 'sent', 'partially_paid', 'paid', 'overdue')
      and i.tax_amount > 0
    union all
    select i.issue_date, '5100', '外注費', i.subtotal, 0, i.currency,
      i.invoice_no || ' 仕入請求', 'invoice', i.id, 1
    from app.invoices i
    where i.tenant_id = tenant and i.deleted_at is null and i.invoice_type = 'purchase'
      and date_trunc('month', coalesce(i.billing_period_start, i.issue_date))::date = period.period_month
      and i.status in ('issued', 'sent', 'partially_paid', 'paid', 'overdue')
      and i.subtotal > 0
    union all
    select i.issue_date, '1300', '仮払消費税', i.tax_amount, 0, i.currency,
      i.invoice_no || ' 仕入請求', 'invoice', i.id, 2
    from app.invoices i
    where i.tenant_id = tenant and i.deleted_at is null and i.invoice_type = 'purchase'
      and date_trunc('month', coalesce(i.billing_period_start, i.issue_date))::date = period.period_month
      and i.status in ('issued', 'sent', 'partially_paid', 'paid', 'overdue')
      and i.tax_amount > 0
    union all
    select i.issue_date, '2200', '買掛金', 0, i.total_amount, i.currency,
      i.invoice_no || ' 仕入請求', 'invoice', i.id, 3
    from app.invoices i
    where i.tenant_id = tenant and i.deleted_at is null and i.invoice_type = 'purchase'
      and date_trunc('month', coalesce(i.billing_period_start, i.issue_date))::date = period.period_month
      and i.status in ('issued', 'sent', 'partially_paid', 'paid', 'overdue')
    union all
    select p.payment_date,
      case when i.invoice_type = 'sales' and p.payment_type <> 'refund' then '1000'
           when i.invoice_type = 'sales' then '1100'
           when p.payment_type <> 'refund' then '2200' else '1000' end,
      case when i.invoice_type = 'sales' and p.payment_type <> 'refund' then '普通預金'
           when i.invoice_type = 'sales' then '売掛金'
           when p.payment_type <> 'refund' then '買掛金' else '普通預金' end,
      p.amount, 0, p.currency, i.invoice_no || ' 決済', 'payment', p.id, 1
    from app.payments p join app.invoices i
      on i.tenant_id = p.tenant_id and i.id = p.invoice_id
    where p.tenant_id = tenant and p.deleted_at is null
      and date_trunc('month', p.payment_date)::date = period.period_month
    union all
    select p.payment_date,
      case when i.invoice_type = 'sales' and p.payment_type <> 'refund' then '1100'
           when i.invoice_type = 'sales' then '1000'
           when p.payment_type <> 'refund' then '1000' else '2200' end,
      case when i.invoice_type = 'sales' and p.payment_type <> 'refund' then '売掛金'
           when i.invoice_type = 'sales' then '普通預金'
           when p.payment_type <> 'refund' then '普通預金' else '買掛金' end,
      0, p.amount, p.currency, i.invoice_no || ' 決済', 'payment', p.id, 2
    from app.payments p join app.invoices i
      on i.tenant_id = p.tenant_id and i.id = p.invoice_id
    where p.tenant_id = tenant and p.deleted_at is null
      and date_trunc('month', p.payment_date)::date = period.period_month
  ), numbered as (
    select row_number() over (
      order by entry_date, source_type, source_id, sort_no
    )::integer line_no, *
    from source_lines
    where debit_amount > 0 or credit_amount > 0
  )
  insert into app.accounting_export_lines(
    tenant_id, export_batch_id, line_no, entry_date, account_code,
    account_name, debit_amount, credit_amount, currency, description,
    source_type, source_id
  )
  select tenant, batch.id, line_no, entry_date, account_code,
    account_name, debit_amount, credit_amount, currency, description,
    source_type, source_id
  from numbered;

  select coalesce(sum(l.debit_amount), 0), coalesce(sum(l.credit_amount), 0)
  into debit_total, credit_total
  from app.accounting_export_lines l
  where l.tenant_id = tenant and l.export_batch_id = batch.id;
  if debit_total <> credit_total then
    raise exception 'generated accounting export is not balanced' using errcode = '23514';
  end if;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, after_data
  ) values (
    tenant, auth.uid(), 'user', 'accounting_export.generated',
    'accounting_export_batch', batch.id, nullif(p_request_id, ''),
    jsonb_build_object('accounting_period_id', period.id,
      'version_no', batch.version_no, 'export_format', batch.export_format,
      'debit_total', debit_total, 'credit_total', credit_total)
  );
  return jsonb_build_object('id', batch.id);
end
$$;

create or replace function public.mark_accounting_export_batch_exported(
  p_export_batch_id uuid,
  p_row_version bigint,
  p_export_reference text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  target app.accounting_export_batches%rowtype;
  saved app.accounting_export_batches%rowtype;
  reference text := nullif(btrim(p_export_reference), '');
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('finance.manage')
     or p_export_batch_id is null or p_row_version is null or p_row_version < 1
     or (reference is not null and length(reference) > 1000)
  then
    raise exception 'invalid accounting export completion request' using errcode = '22023';
  end if;

  select b.* into target from app.accounting_export_batches b
  where b.tenant_id = tenant and b.id = p_export_batch_id
  for update;
  if not found or target.row_version <> p_row_version
     or target.status <> 'generated'
  then return null; end if;

  update app.accounting_export_batches set
    status = 'exported', exported_at = now(), exported_by = auth.uid(),
    export_reference = reference, updated_by = auth.uid()
  where id = target.id returning * into saved;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data
  ) values (
    tenant, auth.uid(), 'user', 'accounting_export.exported',
    'accounting_export_batch', saved.id, nullif(p_request_id, ''),
    jsonb_build_object('status', target.status, 'row_version', target.row_version),
    jsonb_build_object('status', saved.status, 'row_version', saved.row_version,
      'export_reference', saved.export_reference)
  );
  return jsonb_build_object('id', saved.id);
end
$$;

revoke all on table app.accounting_export_batches,
  app.accounting_export_lines from public, anon, authenticated;
grant all privileges on table app.accounting_export_batches,
  app.accounting_export_lines to service_role;
revoke all on function public.list_accounting_export_batches(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.get_accounting_export_batch_detail(uuid)
  from public, anon, authenticated;
revoke all on function public.generate_accounting_export_batch(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.mark_accounting_export_batch_exported(uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.list_accounting_export_batches(uuid, integer)
  to authenticated;
grant execute on function public.get_accounting_export_batch_detail(uuid)
  to authenticated;
grant execute on function public.generate_accounting_export_batch(uuid, text, text)
  to authenticated;
grant execute on function public.mark_accounting_export_batch_exported(uuid, bigint, text, text)
  to authenticated;

comment on table app.accounting_export_batches is
  'Versioned journal export batches generated only from fully closed accounting periods.';
comment on table app.accounting_export_lines is
  'Balanced debit and credit journal lines retaining invoice or payment source traceability.';

commit;
