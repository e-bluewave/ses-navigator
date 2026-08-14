-- SES Navigator
-- Migration: 145_accounting_period_close_management
-- Purpose: Manage sales, invoice, and payment closes independently with
--          ordered transitions, controlled reopening, history, and audit.

begin;

create table app.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  period_month date not null,
  sales_status text not null default 'open'
    check (sales_status in ('open', 'closed')),
  invoice_status text not null default 'open'
    check (invoice_status in ('open', 'closed')),
  payment_status text not null default 'open'
    check (payment_status in ('open', 'closed')),
  sales_closed_at timestamptz,
  sales_closed_by uuid references auth.users(id) on delete set null,
  invoice_closed_at timestamptz,
  invoice_closed_by uuid references auth.users(id) on delete set null,
  payment_closed_at timestamptz,
  payment_closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, period_month),
  check (period_month = date_trunc('month', period_month)::date),
  check ((sales_status = 'closed') = (sales_closed_at is not null)),
  check ((invoice_status = 'closed') = (invoice_closed_at is not null)),
  check ((payment_status = 'closed') = (payment_closed_at is not null))
);

create table app.accounting_period_status_histories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  accounting_period_id uuid not null,
  close_type text not null check (close_type in ('sales', 'invoice', 'payment')),
  from_status text not null check (from_status in ('open', 'closed')),
  to_status text not null check (to_status in ('open', 'closed')),
  change_reason text,
  impact_confirmed boolean not null default false,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  foreign key (tenant_id, accounting_period_id)
    references app.accounting_periods(tenant_id, id) on delete cascade,
  check (from_status <> to_status),
  check (change_reason is null or length(change_reason) <= 1000)
);

create index accounting_periods_month_idx
  on app.accounting_periods(tenant_id, period_month desc);
create index accounting_period_histories_period_idx
  on app.accounting_period_status_histories(
    tenant_id, accounting_period_id, changed_at desc
  );

select app.attach_updated_at_trigger('app.accounting_periods'::regclass);
select app.attach_row_version_trigger('app.accounting_periods'::regclass);

alter table app.accounting_periods enable row level security;
alter table app.accounting_periods force row level security;

create policy authorization_select
  on app.accounting_periods
  for select
  to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_permission('finance.read')
  );

create policy authorization_insert
  on app.accounting_periods
  for insert
  to authenticated
  with check (
    tenant_id = app.current_tenant_id()
    and created_by = auth.uid()
    and app.has_permission('finance.manage')
  );

create policy authorization_update
  on app.accounting_periods
  for update
  to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_permission('finance.manage')
  )
  with check (
    tenant_id = app.current_tenant_id()
    and app.has_permission('finance.manage')
  );

alter table app.accounting_period_status_histories enable row level security;
alter table app.accounting_period_status_histories force row level security;

create policy authorization_select
  on app.accounting_period_status_histories
  for select
  to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_permission('finance.read')
  );

create policy authorization_insert
  on app.accounting_period_status_histories
  for insert
  to authenticated
  with check (
    tenant_id = app.current_tenant_id()
    and changed_by = auth.uid()
    and app.has_permission('finance.manage')
  );

create or replace function public.list_accounting_periods(
  p_from_month date default null,
  p_to_month date default null,
  p_limit integer default 24
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
     or p_limit is null or p_limit < 1 or p_limit > 120
     or (p_from_month is not null and p_from_month <> date_trunc('month', p_from_month)::date)
     or (p_to_month is not null and p_to_month <> date_trunc('month', p_to_month)::date)
     or (p_from_month is not null and p_to_month is not null and p_from_month > p_to_month)
  then
    raise exception 'invalid accounting period list request' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(period_row) order by period_row.period_month desc), '[]'::jsonb)
  )
  into result
  from (
    select
      p.id,
      p.period_month,
      p.sales_status,
      p.invoice_status,
      p.payment_status,
      p.sales_closed_at,
      p.invoice_closed_at,
      p.payment_closed_at,
      p.updated_at,
      p.row_version
    from app.accounting_periods p
    where p.tenant_id = tenant
      and (p_from_month is null or p.period_month >= p_from_month)
      and (p_to_month is null or p.period_month <= p_to_month)
    order by p.period_month desc
    limit p_limit
  ) period_row;

  return result;
end
$$;

create or replace function public.get_accounting_period_detail(
  p_accounting_period_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  target app.accounting_periods%rowtype;
  histories jsonb;
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('finance.read')
     or p_accounting_period_id is null
  then
    raise exception 'invalid accounting period detail request' using errcode = '22023';
  end if;

  select p.* into target
  from app.accounting_periods p
  where p.id = p_accounting_period_id and p.tenant_id = tenant;
  if not found then return null; end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', h.id,
        'close_type', h.close_type,
        'from_status', h.from_status,
        'to_status', h.to_status,
        'change_reason', h.change_reason,
        'impact_confirmed', h.impact_confirmed,
        'changed_at', h.changed_at,
        'changed_by', h.changed_by
      ) order by h.changed_at desc, h.id desc
    ),
    '[]'::jsonb
  ) into histories
  from app.accounting_period_status_histories h
  where h.tenant_id = tenant and h.accounting_period_id = target.id;

  return (
    to_jsonb(target)
      - array['tenant_id', 'created_by', 'updated_by',
        'sales_closed_by', 'invoice_closed_by', 'payment_closed_by']
  ) || jsonb_build_object('status_histories', histories);
end
$$;

create or replace function public.create_accounting_period(
  p_period_month date,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  saved app.accounting_periods%rowtype;
  inserted boolean := false;
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('finance.manage')
     or p_period_month is null
     or p_period_month <> date_trunc('month', p_period_month)::date
  then
    raise exception 'invalid accounting period creation request' using errcode = '22023';
  end if;

  insert into app.accounting_periods(
    tenant_id, period_month, created_by, updated_by
  ) values (
    tenant, p_period_month, auth.uid(), auth.uid()
  )
  on conflict (tenant_id, period_month) do nothing
  returning * into saved;

  if found then
    inserted := true;
  else
    select p.* into saved from app.accounting_periods p
    where p.tenant_id = tenant and p.period_month = p_period_month;
  end if;

  if inserted then
    insert into audit.audit_logs(
      tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
      request_id, after_data
    ) values (
      tenant, auth.uid(), 'user', 'accounting_period.created',
      'accounting_period', saved.id, nullif(p_request_id, ''),
      jsonb_build_object('period_month', saved.period_month)
    );
  end if;

  return to_jsonb(saved)
    - array['tenant_id', 'created_by', 'updated_by',
      'sales_closed_by', 'invoice_closed_by', 'payment_closed_by'];
end
$$;

create or replace function public.transition_accounting_period_status(
  p_accounting_period_id uuid,
  p_row_version bigint,
  p_close_type text,
  p_to_status text,
  p_reason text default null,
  p_impact_confirmed boolean default false,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  target app.accounting_periods%rowtype;
  saved app.accounting_periods%rowtype;
  from_status text;
  normalized_reason text := nullif(btrim(p_reason), '');
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('finance.manage')
     or p_accounting_period_id is null
     or p_row_version is null or p_row_version < 1
     or p_close_type is null or p_close_type not in ('sales', 'invoice', 'payment')
     or p_to_status is null or p_to_status not in ('open', 'closed')
     or (normalized_reason is not null and length(normalized_reason) > 1000)
     or (p_to_status = 'open' and (
       normalized_reason is null or not coalesce(p_impact_confirmed, false)
     ))
  then
    raise exception 'invalid accounting period transition request' using errcode = '22023';
  end if;

  select p.* into target
  from app.accounting_periods p
  where p.id = p_accounting_period_id and p.tenant_id = tenant
  for update;
  if not found or target.row_version <> p_row_version then return null; end if;

  from_status := case p_close_type
    when 'sales' then target.sales_status
    when 'invoice' then target.invoice_status
    else target.payment_status
  end;
  if from_status = p_to_status then return to_jsonb(target)
    - array['tenant_id', 'created_by', 'updated_by',
      'sales_closed_by', 'invoice_closed_by', 'payment_closed_by'];
  end if;

  if (p_close_type = 'invoice' and p_to_status = 'closed' and target.sales_status <> 'closed')
     or (p_close_type = 'payment' and p_to_status = 'closed' and target.invoice_status <> 'closed')
     or (p_close_type = 'sales' and p_to_status = 'open' and target.invoice_status <> 'open')
     or (p_close_type = 'invoice' and p_to_status = 'open' and target.payment_status <> 'open')
  then
    return null;
  end if;

  if p_close_type = 'sales' and p_to_status = 'closed' and exists (
    select 1 from app.work_logs w
    where w.tenant_id = tenant
      and w.work_month = target.period_month
      and w.deleted_at is null
      and w.status <> 'locked'
  ) then
    return null;
  end if;

  if p_close_type = 'invoice' and p_to_status = 'closed' and exists (
    select 1 from app.invoices i
    where i.tenant_id = tenant
      and date_trunc(
        'month', coalesce(i.billing_period_start, i.issue_date)
      )::date = target.period_month
      and i.deleted_at is null
      and i.status = 'draft'
  ) then
    return null;
  end if;

  update app.accounting_periods set
    sales_status = case when p_close_type = 'sales' then p_to_status else sales_status end,
    sales_closed_at = case
      when p_close_type = 'sales' and p_to_status = 'closed' then now()
      when p_close_type = 'sales' then null
      else sales_closed_at
    end,
    sales_closed_by = case
      when p_close_type = 'sales' and p_to_status = 'closed' then auth.uid()
      when p_close_type = 'sales' then null
      else sales_closed_by
    end,
    invoice_status = case when p_close_type = 'invoice' then p_to_status else invoice_status end,
    invoice_closed_at = case
      when p_close_type = 'invoice' and p_to_status = 'closed' then now()
      when p_close_type = 'invoice' then null
      else invoice_closed_at
    end,
    invoice_closed_by = case
      when p_close_type = 'invoice' and p_to_status = 'closed' then auth.uid()
      when p_close_type = 'invoice' then null
      else invoice_closed_by
    end,
    payment_status = case when p_close_type = 'payment' then p_to_status else payment_status end,
    payment_closed_at = case
      when p_close_type = 'payment' and p_to_status = 'closed' then now()
      when p_close_type = 'payment' then null
      else payment_closed_at
    end,
    payment_closed_by = case
      when p_close_type = 'payment' and p_to_status = 'closed' then auth.uid()
      when p_close_type = 'payment' then null
      else payment_closed_by
    end,
    updated_by = auth.uid()
  where id = target.id
  returning * into saved;

  insert into app.accounting_period_status_histories(
    tenant_id, accounting_period_id, close_type, from_status, to_status,
    change_reason, impact_confirmed, changed_by, request_id
  ) values (
    tenant, saved.id, p_close_type, from_status, p_to_status,
    normalized_reason, p_impact_confirmed, auth.uid(), nullif(p_request_id, '')
  );

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'accounting_period.status_changed',
    'accounting_period', saved.id, nullif(p_request_id, ''),
    jsonb_build_object('close_type', p_close_type, 'status', from_status,
      'row_version', target.row_version),
    jsonb_build_object('close_type', p_close_type, 'status', p_to_status,
      'row_version', saved.row_version),
    jsonb_build_object('reason', normalized_reason,
      'impact_confirmed', p_impact_confirmed)
  );

  return to_jsonb(saved)
    - array['tenant_id', 'created_by', 'updated_by',
      'sales_closed_by', 'invoice_closed_by', 'payment_closed_by'];
end
$$;

create or replace function private.accounting_period_is_closed(
  p_tenant_id uuid,
  p_business_date date,
  p_close_type text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from app.accounting_periods p
    where p.tenant_id = p_tenant_id
      and p.period_month = date_trunc('month', p_business_date)::date
      and case p_close_type
        when 'sales' then p.sales_status
        when 'invoice' then p.invoice_status
        when 'payment' then p.payment_status
        else 'open'
      end = 'closed'
  );
$$;

create or replace function private.enforce_work_log_sales_period_open()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target app.work_logs%rowtype;
begin
  target := case when tg_op = 'DELETE' then old else new end;
  if private.accounting_period_is_closed(
    target.tenant_id, target.work_month, 'sales'
  ) then
    raise exception 'sales accounting period is closed' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create or replace function private.enforce_invoice_period_open()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target app.invoices%rowtype;
  old_period_closed boolean := false;
  new_period_closed boolean := false;
  settlement_only boolean := false;
begin
  if tg_op <> 'INSERT' then
    old_period_closed := private.accounting_period_is_closed(
      old.tenant_id, coalesce(old.billing_period_start, old.issue_date), 'invoice'
    );
  end if;
  if tg_op <> 'DELETE' then
    new_period_closed := private.accounting_period_is_closed(
      new.tenant_id, coalesce(new.billing_period_start, new.issue_date), 'invoice'
    );
  end if;

  if tg_op = 'UPDATE' then
    settlement_only :=
      to_jsonb(new) - array['paid_amount', 'status', 'updated_at', 'updated_by', 'row_version']
      = to_jsonb(old) - array['paid_amount', 'status', 'updated_at', 'updated_by', 'row_version']
      and old.status in ('issued', 'sent', 'partially_paid', 'paid', 'overdue')
      and new.status in ('issued', 'sent', 'partially_paid', 'paid', 'overdue');
  end if;

  if (old_period_closed or new_period_closed) and not settlement_only then
    raise exception 'invoice accounting period is closed' using errcode = '55000';
  end if;
  target := case when tg_op = 'DELETE' then old else new end;
  return target;
end
$$;

create or replace function private.enforce_payment_period_open()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  old_period_closed boolean := false;
  new_period_closed boolean := false;
begin
  if tg_op <> 'INSERT' then
    old_period_closed := private.accounting_period_is_closed(
      old.tenant_id, old.payment_date, 'payment'
    );
  end if;
  if tg_op <> 'DELETE' then
    new_period_closed := private.accounting_period_is_closed(
      new.tenant_id, new.payment_date, 'payment'
    );
  end if;
  if old_period_closed or new_period_closed then
    raise exception 'payment accounting period is closed' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger work_logs_enforce_sales_period_open
before insert or update or delete on app.work_logs
for each row execute function private.enforce_work_log_sales_period_open();

create trigger invoices_enforce_invoice_period_open
before insert or update or delete on app.invoices
for each row execute function private.enforce_invoice_period_open();

create trigger payments_enforce_payment_period_open
before insert or update or delete on app.payments
for each row execute function private.enforce_payment_period_open();

revoke all on table app.accounting_periods,
  app.accounting_period_status_histories from public, anon, authenticated;
grant all privileges on table app.accounting_periods,
  app.accounting_period_status_histories to service_role;

revoke all on function public.list_accounting_periods(date, date, integer)
  from public, anon, authenticated;
revoke all on function public.get_accounting_period_detail(uuid)
  from public, anon, authenticated;
revoke all on function public.create_accounting_period(date, text)
  from public, anon, authenticated;
revoke all on function public.transition_accounting_period_status(
  uuid, bigint, text, text, text, boolean, text
) from public, anon, authenticated;
revoke all on function private.accounting_period_is_closed(uuid, date, text)
  from public, anon, authenticated;
revoke all on function private.enforce_work_log_sales_period_open()
  from public, anon, authenticated;
revoke all on function private.enforce_invoice_period_open()
  from public, anon, authenticated;
revoke all on function private.enforce_payment_period_open()
  from public, anon, authenticated;

grant execute on function public.list_accounting_periods(date, date, integer)
  to authenticated;
grant execute on function public.get_accounting_period_detail(uuid)
  to authenticated;
grant execute on function public.create_accounting_period(date, text)
  to authenticated;
grant execute on function public.transition_accounting_period_status(
  uuid, bigint, text, text, text, boolean, text
) to authenticated;

comment on table app.accounting_periods is
  'Tenant accounting months with independent ordered sales, invoice, and payment close states.';
comment on table app.accounting_period_status_histories is
  'Append-only close and controlled reopen history for accounting periods.';
comment on function public.transition_accounting_period_status(
  uuid, bigint, text, text, text, boolean, text
) is
  'Closes accounting stages in order and reopens them in reverse order with mandatory reason and impact confirmation.';
comment on function private.accounting_period_is_closed(uuid, date, text) is
  'Returns whether one tenant accounting stage is closed for a business date.';
comment on function private.enforce_invoice_period_open() is
  'Blocks invoice content changes after invoice close while permitting payment settlement recalculation.';

commit;
