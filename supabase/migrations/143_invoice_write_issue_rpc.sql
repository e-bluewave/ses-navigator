-- SES Navigator
-- Migration: 143_invoice_write_issue_rpc
-- Purpose: Save invoice drafts and apply issue, send, cancel, and void
--          transitions atomically under the finance authorization boundary.

begin;

create table app.invoice_status_histories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  invoice_id uuid not null,
  from_status text,
  to_status text not null check (to_status in (
    'draft','issued','sent','partially_paid','paid','overdue','cancelled','void'
  )),
  change_reason text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  foreign key (tenant_id, invoice_id)
    references app.invoices(tenant_id, id) on delete cascade
);

create index invoice_status_histories_invoice_idx
  on app.invoice_status_histories(tenant_id, invoice_id, changed_at desc);

alter table app.invoice_status_histories enable row level security;
alter table app.invoice_status_histories force row level security;

create policy authorization_select
  on app.invoice_status_histories for select to authenticated
  using (app.can_access_invoice(invoice_id, 'finance.read', 'view'));

revoke all on app.invoice_status_histories from public, anon, authenticated;

create or replace function public.list_invoice_billing_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('finance.manage')
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id,
      'company_id', b.company_id,
      'company_name', c.legal_name,
      'account_type', b.account_type,
      'account_name', b.account_name,
      'closing_day', b.closing_day,
      'payment_month_offset', b.payment_month_offset,
      'payment_day', b.payment_day,
      'invoice_delivery_method', b.invoice_delivery_method,
      'is_default', b.is_default
    ) order by c.legal_name, b.account_name, b.id)
    from app.billing_accounts b
    join app.companies c
      on c.tenant_id = b.tenant_id and c.id = b.company_id
     and c.deleted_at is null
    where b.tenant_id = tenant and b.deleted_at is null
  ), '[]'::jsonb);
end
$$;

create or replace function public.save_invoice(
  p_invoice_id uuid,
  p_row_version bigint,
  p_invoice jsonb,
  p_items jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  target app.invoices%rowtype;
  saved app.invoices%rowtype;
  billing app.billing_accounts%rowtype;
  item jsonb;
  position integer := 0;
  v_invoice_no text;
  v_invoice_type text;
  v_contract_id uuid;
  v_billing_account_id uuid;
  v_period_start date;
  v_period_end date;
  v_issue_date date;
  v_due_date date;
  v_currency text;
  v_item_type text;
  v_description text;
  v_quantity numeric(12,4);
  v_unit text;
  v_unit_price numeric(14,2);
  v_tax_rate numeric(5,2);
  v_amount numeric(14,2);
  v_tax_amount numeric(14,2);
  v_work_log_id uuid;
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('finance.manage')
     or p_row_version is null or p_row_version < 0
     or p_invoice is null or jsonb_typeof(p_invoice) <> 'object'
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) > 100
  then
    raise exception 'invalid invoice save request' using errcode = '22023';
  end if;

  begin
    v_invoice_no := nullif(btrim(p_invoice->>'invoice_no'), '');
    v_invoice_type := btrim(p_invoice->>'invoice_type');
    v_contract_id := nullif(p_invoice->>'contract_id', '')::uuid;
    v_billing_account_id := (p_invoice->>'billing_account_id')::uuid;
    v_period_start := nullif(p_invoice->>'billing_period_start', '')::date;
    v_period_end := nullif(p_invoice->>'billing_period_end', '')::date;
    v_issue_date := (p_invoice->>'issue_date')::date;
    v_due_date := (p_invoice->>'due_date')::date;
    v_currency := upper(btrim(p_invoice->>'currency'));
  exception when others then
    raise exception 'invalid invoice fields' using errcode = '22023';
  end;

  if v_invoice_no is null or length(v_invoice_no) > 40
     or v_invoice_type is null or v_invoice_type not in ('sales','purchase')
     or v_issue_date is null or v_due_date is null or v_due_date < v_issue_date
     or (v_period_start is null) <> (v_period_end is null)
     or (v_period_end is not null and v_period_end < v_period_start)
     or v_currency !~ '^[A-Z]{3}$'
  then
    raise exception 'invalid invoice fields' using errcode = '22023';
  end if;

  select b.* into billing from app.billing_accounts b
  where b.id = v_billing_account_id and b.tenant_id = tenant
    and b.deleted_at is null;
  if not found
     or (v_invoice_type = 'sales' and billing.account_type not in ('receivable','both'))
     or (v_invoice_type = 'purchase' and billing.account_type not in ('payable','both'))
  then return null; end if;

  if v_contract_id is not null and not exists (
    select 1 from app.contracts c
    where c.id = v_contract_id and c.tenant_id = tenant and c.deleted_at is null
      and app.can_access_contract(c.id, 'finance.manage', 'edit')
  ) then return null; end if;

  if exists (
    select 1 from app.invoices i
    where i.tenant_id = tenant and i.invoice_no = v_invoice_no
      and i.deleted_at is null
      and (p_invoice_id is null or i.id <> p_invoice_id)
  ) then return null; end if;

  if p_invoice_id is null then
    if p_row_version <> 0 then return null; end if;
    insert into app.invoices(
      tenant_id, invoice_no, invoice_type, contract_id, billing_account_id,
      billing_company_id, billing_period_start, billing_period_end, issue_date,
      due_date, status, currency, created_by, updated_by
    ) values (
      tenant, v_invoice_no, v_invoice_type, v_contract_id, billing.id,
      billing.company_id, v_period_start, v_period_end, v_issue_date,
      v_due_date, 'draft', v_currency, auth.uid(), auth.uid()
    ) returning * into saved;
    insert into app.invoice_status_histories(
      tenant_id, invoice_id, from_status, to_status, change_reason, changed_by
    ) values (tenant, saved.id, null, 'draft', 'Invoice created', auth.uid());
  else
    select i.* into target from app.invoices i
    where i.id = p_invoice_id and i.tenant_id = tenant and i.deleted_at is null
      and app.can_access_invoice(i.id, 'finance.manage', 'edit')
    for update;
    if not found or target.row_version <> p_row_version or target.status <> 'draft'
    then return null; end if;
    update app.invoices set
      invoice_no = v_invoice_no,
      invoice_type = v_invoice_type,
      contract_id = v_contract_id,
      billing_account_id = billing.id,
      billing_company_id = billing.company_id,
      billing_period_start = v_period_start,
      billing_period_end = v_period_end,
      issue_date = v_issue_date,
      due_date = v_due_date,
      currency = v_currency,
      updated_by = auth.uid()
    where id = target.id returning * into saved;
    delete from app.invoice_items where tenant_id = tenant and invoice_id = saved.id;
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    position := position + 1;
    begin
      if jsonb_typeof(item) <> 'object' then raise exception 'invalid item'; end if;
      v_item_type := btrim(item->>'item_type');
      v_description := nullif(btrim(item->>'description'), '');
      v_quantity := (item->>'quantity')::numeric;
      v_unit := nullif(btrim(item->>'unit'), '');
      v_unit_price := (item->>'unit_price')::numeric;
      v_tax_rate := (item->>'tax_rate')::numeric;
      v_amount := (item->>'amount')::numeric;
      v_tax_amount := (item->>'tax_amount')::numeric;
      v_work_log_id := nullif(item->>'work_log_id', '')::uuid;
    exception when others then
      raise exception 'invalid invoice item' using errcode = '22023';
    end;
    if v_item_type is null
       or v_item_type not in ('service','expense','adjustment','discount','tax_exempt','other')
       or v_description is null or length(v_description) > 1000
       or v_quantity is null or v_quantity < 0
       or v_unit_price is null
       or v_tax_rate is null or v_tax_rate < 0 or v_tax_rate > 100
       or v_amount is null
       or v_tax_amount is null or v_tax_amount < 0
       or length(coalesce(v_unit, '')) > 40
       or (v_item_type = 'discount' and v_amount > 0)
       or (v_item_type <> 'discount' and v_amount < 0)
       or (v_work_log_id is not null and not exists (
         select 1 from app.work_logs w
         where w.id = v_work_log_id and w.tenant_id = tenant and w.deleted_at is null
           and (v_contract_id is null or w.contract_id = v_contract_id)
       ))
    then raise exception 'invalid invoice item' using errcode = '22023'; end if;
    insert into app.invoice_items(
      tenant_id, invoice_id, line_no, item_type, description, quantity, unit,
      unit_price, tax_rate, amount, tax_amount, work_log_id, display_order,
      created_by, updated_by
    ) values (
      tenant, saved.id, position, v_item_type, v_description, v_quantity, v_unit,
      v_unit_price, v_tax_rate, v_amount, v_tax_amount, v_work_log_id, position,
      auth.uid(), auth.uid()
    );
  end loop;

  update app.invoices i set
    subtotal = coalesce((select sum(x.amount) from app.invoice_items x
      where x.tenant_id = tenant and x.invoice_id = i.id and x.deleted_at is null), 0),
    tax_amount = coalesce((select sum(x.tax_amount) from app.invoice_items x
      where x.tenant_id = tenant and x.invoice_id = i.id and x.deleted_at is null), 0),
    total_amount = coalesce((select sum(x.amount + x.tax_amount) from app.invoice_items x
      where x.tenant_id = tenant and x.invoice_id = i.id and x.deleted_at is null), 0),
    updated_by = auth.uid()
  where i.id = saved.id returning * into saved;

  if saved.subtotal < 0 or saved.total_amount < 0 then
    raise exception 'invoice total cannot be negative' using errcode = '22023';
  end if;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user',
    case when p_invoice_id is null then 'invoice.created' else 'invoice.updated' end,
    'invoice', saved.id, nullif(p_request_id, ''),
    case when p_invoice_id is null then null else jsonb_build_object(
      'status', target.status, 'row_version', target.row_version
    ) end,
    jsonb_build_object('status', saved.status, 'row_version', saved.row_version,
      'total_amount', saved.total_amount),
    jsonb_build_object('item_count', jsonb_array_length(p_items))
  );
  return jsonb_build_object('id', saved.id);
end
$$;

create or replace function public.transition_invoice_status(
  p_invoice_id uuid,
  p_row_version bigint,
  p_to_status text,
  p_reason text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  target app.invoices%rowtype;
  saved app.invoices%rowtype;
  normalized_reason text := nullif(btrim(p_reason), '');
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('finance.manage')
     or p_invoice_id is null or p_row_version is null or p_row_version < 1
     or p_to_status not in ('issued','sent','cancelled','void')
     or length(coalesce(normalized_reason, '')) > 1000
  then raise exception 'invalid invoice transition request' using errcode = '22023'; end if;

  select i.* into target from app.invoices i
  where i.id = p_invoice_id and i.tenant_id = tenant and i.deleted_at is null
    and app.can_access_invoice(i.id, 'finance.manage', 'edit')
  for update;
  if not found or target.row_version <> p_row_version then return null; end if;

  if not (
    (target.status = 'draft' and p_to_status in ('issued','cancelled'))
    or (target.status = 'issued' and p_to_status in ('sent','void'))
    or (target.status in ('sent','overdue') and p_to_status = 'void')
  ) or (p_to_status in ('cancelled','void') and normalized_reason is null)
     or (p_to_status = 'issued' and (
       target.total_amount <= 0 or not exists (
         select 1 from app.invoice_items x
         where x.tenant_id = tenant and x.invoice_id = target.id and x.deleted_at is null
       )
     ))
  then return null; end if;

  update app.invoices set
    status = p_to_status,
    sent_at = case when p_to_status = 'sent' then now() else sent_at end,
    updated_by = auth.uid()
  where id = target.id returning * into saved;

  insert into app.invoice_status_histories(
    tenant_id, invoice_id, from_status, to_status, change_reason, changed_by
  ) values (tenant, saved.id, target.status, saved.status, normalized_reason, auth.uid());

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'invoice.status_changed', 'invoice', saved.id,
    nullif(p_request_id, ''),
    jsonb_build_object('status', target.status, 'row_version', target.row_version),
    jsonb_build_object('status', saved.status, 'row_version', saved.row_version),
    jsonb_build_object('reason', normalized_reason)
  );
  return jsonb_build_object('id', saved.id);
end
$$;

-- Extend the safe invoice detail with lifecycle history while retaining the
-- existing billing, item, and payment fields.
create or replace function public.get_invoice_status_histories(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare tenant uuid := app.current_tenant_id();
begin
  if auth.uid() is null or tenant is null
     or not app.can_access_invoice(p_invoice_id, 'finance.read', 'view')
  then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', h.id, 'from_status', h.from_status, 'to_status', h.to_status,
    'change_reason', h.change_reason, 'changed_at', h.changed_at
  ) order by h.changed_at desc, h.id desc)
  from app.invoice_status_histories h
  where h.tenant_id = tenant and h.invoice_id = p_invoice_id), '[]'::jsonb);
end
$$;

revoke all on function public.list_invoice_billing_options() from public, anon, authenticated;
revoke all on function public.save_invoice(uuid, bigint, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.transition_invoice_status(uuid, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.get_invoice_status_histories(uuid) from public, anon, authenticated;
grant execute on function public.list_invoice_billing_options() to authenticated;
grant execute on function public.save_invoice(uuid, bigint, jsonb, jsonb, text) to authenticated;
grant execute on function public.transition_invoice_status(uuid, bigint, text, text, text) to authenticated;
grant execute on function public.get_invoice_status_histories(uuid) to authenticated;

comment on function public.list_invoice_billing_options() is
  'Returns tenant billing-account choices for authorized invoice editors.';
comment on function public.save_invoice(uuid, bigint, jsonb, jsonb, text) is
  'Creates or updates an authorized invoice draft, replaces lines, recalculates totals, and audits the mutation.';
comment on function public.transition_invoice_status(uuid, bigint, text, text, text) is
  'Issues, sends, cancels, or voids an authorized invoice with lifecycle history and audit state kept atomic.';

commit;
