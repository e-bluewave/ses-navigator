-- SES Navigator
-- Migration: 147_expense_approval_flow
-- Purpose: Provide controlled expense reads, draft writes, approval transitions,
--          immutable status history, and audit records.

begin;

create table app.expense_status_histories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  expense_id uuid not null,
  from_status text,
  to_status text not null
    check (to_status in ('draft','submitted','approved','rejected','invoiced','reimbursed','cancelled')),
  change_reason text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  foreign key (tenant_id, expense_id)
    references app.expense_records(tenant_id, id) on delete cascade
);

create index expense_status_histories_expense_idx
  on app.expense_status_histories(tenant_id, expense_id, changed_at desc);

alter table app.expense_status_histories enable row level security;
alter table app.expense_status_histories force row level security;
create policy authorization_select on app.expense_status_histories
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_permission('finance.read')
    and exists (
      select 1 from app.expense_records e
      where e.tenant_id = app.expense_status_histories.tenant_id
        and e.id = app.expense_status_histories.expense_id
        and e.deleted_at is null
    )
  );

revoke all on table app.expense_status_histories from public, anon, authenticated;
grant all privileges on table app.expense_status_histories to service_role;

create or replace function public.list_expense_records(
  p_query text default null,
  p_status text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  query_text text := nullif(btrim(p_query), '');
  result jsonb;
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('finance.read')
     or (p_status is not null and p_status not in ('draft','submitted','approved','rejected','invoiced','reimbursed','cancelled'))
     or p_limit is null or p_limit < 1 or p_limit > 200
     or (p_date_from is not null and p_date_to is not null and p_date_from > p_date_to)
     or length(coalesce(query_text, '')) > 100
  then
    raise exception 'invalid expense list request' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(expense_row) order by expense_row.expense_date desc, expense_row.id desc), '[]'::jsonb)
  ) into result
  from (
    select e.id, e.contract_id, e.work_log_id, e.engineer_id,
      c.contract_no, c.title contract_title,
      coalesce(nullif(en.display_name, ''), concat_ws(' ', en.family_name, en.given_name)) engineer_name,
      e.expense_date, e.expense_type, e.description, e.amount, e.tax_amount,
      e.currency, e.status, e.billable, e.invoice_id, e.approved_at,
      e.updated_at, e.row_version
    from app.expense_records e
    left join app.contracts c
      on c.tenant_id = e.tenant_id and c.id = e.contract_id and c.deleted_at is null
    left join app.engineers en
      on en.tenant_id = e.tenant_id and en.id = e.engineer_id and en.deleted_at is null
    where e.tenant_id = tenant and e.deleted_at is null
      and (
        app.has_permission('finance.manage')
        or e.created_by = auth.uid()
        or (e.contract_id is not null
          and app.can_access_contract(e.contract_id, 'finance.read', 'view'))
        or (e.invoice_id is not null
          and app.can_access_invoice(e.invoice_id, 'finance.read', 'view'))
      )
      and (p_status is null or e.status = p_status)
      and (p_date_from is null or e.expense_date >= p_date_from)
      and (p_date_to is null or e.expense_date <= p_date_to)
      and (query_text is null or e.description ilike '%' || query_text || '%'
        or c.contract_no ilike '%' || query_text || '%'
        or c.title ilike '%' || query_text || '%'
        or en.display_name ilike '%' || query_text || '%')
    order by e.expense_date desc, e.id desc
    limit p_limit
  ) expense_row;
  return result;
end
$$;

create or replace function public.get_expense_record_detail(p_expense_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  result jsonb;
begin
  if auth.uid() is null or tenant is null or p_expense_id is null
     or not app.has_permission('finance.read')
  then
    raise exception 'invalid expense detail request' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'id', e.id, 'contract_id', e.contract_id, 'work_log_id', e.work_log_id,
    'engineer_id', e.engineer_id, 'contract_no', c.contract_no,
    'contract_title', c.title,
    'engineer_name', coalesce(nullif(en.display_name, ''), concat_ws(' ', en.family_name, en.given_name)),
    'expense_date', e.expense_date, 'expense_type', e.expense_type,
    'description', e.description, 'amount', e.amount, 'tax_amount', e.tax_amount,
    'currency', e.currency, 'status', e.status, 'billable', e.billable,
    'invoice_id', e.invoice_id, 'receipt_path', e.receipt_path,
    'approved_at', e.approved_at, 'notes', e.notes,
    'updated_at', e.updated_at, 'row_version', e.row_version,
    'status_histories', coalesce((select jsonb_agg(jsonb_build_object(
      'id', h.id, 'from_status', h.from_status, 'to_status', h.to_status,
      'change_reason', h.change_reason, 'changed_at', h.changed_at
    ) order by h.changed_at desc, h.id desc)
      from app.expense_status_histories h
      where h.tenant_id = e.tenant_id and h.expense_id = e.id), '[]'::jsonb),
    'approval', (select jsonb_build_object(
      'id', ar.id, 'status', ar.status, 'requested_at', ar.requested_at,
      'completed_at', ar.completed_at, 'request_note', ar.request_note,
      'decision_note', ar.decision_note)
      from app.approval_requests ar
      where ar.tenant_id = e.tenant_id and ar.target_type = 'expense'
        and ar.target_id = e.id and ar.request_type = 'expense_approval'
      order by ar.created_at desc, ar.id desc limit 1)
  ) into result
  from app.expense_records e
  left join app.contracts c
    on c.tenant_id = e.tenant_id and c.id = e.contract_id and c.deleted_at is null
  left join app.engineers en
    on en.tenant_id = e.tenant_id and en.id = e.engineer_id and en.deleted_at is null
  where e.tenant_id = tenant and e.id = p_expense_id and e.deleted_at is null
    and (
      app.has_permission('finance.manage')
      or e.created_by = auth.uid()
      or (e.contract_id is not null
        and app.can_access_contract(e.contract_id, 'finance.read', 'view'))
      or (e.invoice_id is not null
        and app.can_access_invoice(e.invoice_id, 'finance.read', 'view'))
    );
  return result;
end
$$;

create or replace function public.save_expense_record(
  p_expense_id uuid,
  p_row_version bigint,
  p_expense jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  target app.expense_records%rowtype;
  saved app.expense_records%rowtype;
  v_contract_id uuid;
  v_work_log_id uuid;
  v_engineer_id uuid;
  v_expense_date date;
  v_expense_type text;
  v_description text;
  v_amount numeric(14,2);
  v_tax_amount numeric(14,2);
  v_currency text;
  v_billable boolean;
  v_receipt_path text;
  v_notes text;
begin
  if auth.uid() is null or tenant is null or not app.has_permission('finance.manage')
     or p_row_version is null or p_row_version < 0
     or p_expense is null or jsonb_typeof(p_expense) <> 'object'
  then raise exception 'invalid expense save request' using errcode = '22023'; end if;

  begin
    v_contract_id := nullif(p_expense->>'contract_id', '')::uuid;
    v_work_log_id := nullif(p_expense->>'work_log_id', '')::uuid;
    v_engineer_id := nullif(p_expense->>'engineer_id', '')::uuid;
    v_expense_date := (p_expense->>'expense_date')::date;
    v_expense_type := btrim(p_expense->>'expense_type');
    v_description := btrim(p_expense->>'description');
    v_amount := (p_expense->>'amount')::numeric;
    v_tax_amount := coalesce(nullif(p_expense->>'tax_amount', '')::numeric, 0);
    v_currency := upper(btrim(coalesce(p_expense->>'currency', 'JPY')));
    v_billable := coalesce((p_expense->>'billable')::boolean, false);
    v_receipt_path := nullif(btrim(p_expense->>'receipt_path'), '');
    v_notes := nullif(btrim(p_expense->>'notes'), '');
  exception when others then
    raise exception 'invalid expense fields' using errcode = '22023';
  end;

  if v_expense_date is null
     or v_expense_type not in ('transportation','lodging','communication','equipment','meal','other')
     or v_description is null or length(v_description) < 1 or length(v_description) > 1000
     or v_amount is null or v_amount <= 0 or v_tax_amount < 0 or v_tax_amount > v_amount
     or v_currency !~ '^[A-Z]{3}$'
     or length(coalesce(v_receipt_path, '')) > 2000
     or length(coalesce(v_notes, '')) > 5000
     or (v_billable and v_contract_id is null)
  then raise exception 'invalid expense fields' using errcode = '22023'; end if;

  if v_contract_id is not null and not exists (
    select 1 from app.contracts c where c.tenant_id = tenant and c.id = v_contract_id
      and c.deleted_at is null and app.can_access_contract(c.id, 'finance.manage', 'edit')
  ) then return null; end if;
  if v_engineer_id is not null and not exists (
    select 1 from app.engineers en where en.tenant_id = tenant and en.id = v_engineer_id
      and en.deleted_at is null
  ) then return null; end if;
  if v_work_log_id is not null and not exists (
    select 1 from app.work_logs w where w.tenant_id = tenant and w.id = v_work_log_id
      and w.deleted_at is null
      and (v_contract_id is null or w.contract_id = v_contract_id)
      and (v_engineer_id is null or w.engineer_id = v_engineer_id)
  ) then return null; end if;

  if p_expense_id is null then
    if p_row_version <> 0 then return null; end if;
    insert into app.expense_records(
      tenant_id, contract_id, work_log_id, engineer_id, expense_date,
      expense_type, description, amount, tax_amount, currency, status,
      billable, receipt_path, notes, created_by, updated_by
    ) values (
      tenant, v_contract_id, v_work_log_id, v_engineer_id, v_expense_date,
      v_expense_type, v_description, v_amount, v_tax_amount, v_currency, 'draft',
      v_billable, v_receipt_path, v_notes, auth.uid(), auth.uid()
    ) returning * into saved;
    insert into app.expense_status_histories(
      tenant_id, expense_id, from_status, to_status, change_reason, changed_by
    ) values (tenant, saved.id, null, 'draft', 'Expense created', auth.uid());
  else
    select e.* into target from app.expense_records e
    where e.tenant_id = tenant and e.id = p_expense_id and e.deleted_at is null
    for update;
    if not found or target.row_version <> p_row_version
       or target.status not in ('draft','rejected')
    then return null; end if;
    update app.expense_records set
      contract_id = v_contract_id, work_log_id = v_work_log_id,
      engineer_id = v_engineer_id, expense_date = v_expense_date,
      expense_type = v_expense_type, description = v_description,
      amount = v_amount, tax_amount = v_tax_amount, currency = v_currency,
      status = 'draft', billable = v_billable, receipt_path = v_receipt_path,
      notes = v_notes, approved_at = null, approved_by = null,
      updated_by = auth.uid()
    where id = target.id returning * into saved;
    if target.status = 'rejected' then
      insert into app.expense_status_histories(
        tenant_id, expense_id, from_status, to_status, change_reason, changed_by
      ) values (tenant, saved.id, target.status, 'draft', 'Expense revised', auth.uid());
    end if;
  end if;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data
  ) values (
    tenant, auth.uid(), 'user',
    case when p_expense_id is null then 'expense.created' else 'expense.updated' end,
    'expense', saved.id, nullif(p_request_id, ''),
    case when p_expense_id is null then null else jsonb_build_object(
      'status', target.status, 'row_version', target.row_version) end,
    jsonb_build_object('status', saved.status, 'row_version', saved.row_version,
      'amount', saved.amount, 'currency', saved.currency)
  );
  return jsonb_build_object('id', saved.id);
end
$$;

create or replace function public.transition_expense_status(
  p_expense_id uuid,
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
  target app.expense_records%rowtype;
  saved app.expense_records%rowtype;
  approval app.approval_requests%rowtype;
  reason text := nullif(btrim(p_reason), '');
  allowed boolean := false;
begin
  if auth.uid() is null or tenant is null or not app.has_permission('finance.manage')
     or p_expense_id is null or p_row_version is null or p_row_version < 1
     or p_to_status not in ('submitted','approved','rejected','invoiced','reimbursed','cancelled')
     or length(coalesce(reason, '')) > 1000
     or (p_to_status in ('rejected','cancelled') and reason is null)
  then raise exception 'invalid expense status request' using errcode = '22023'; end if;

  select e.* into target from app.expense_records e
  where e.tenant_id = tenant and e.id = p_expense_id and e.deleted_at is null
  for update;
  if not found or target.row_version <> p_row_version then return null; end if;

  allowed := (target.status = 'draft' and p_to_status in ('submitted','cancelled'))
    or (target.status = 'rejected' and p_to_status in ('submitted','cancelled'))
    or (target.status = 'submitted' and p_to_status in ('approved','rejected','cancelled'))
    or (target.status = 'approved' and p_to_status in ('invoiced','reimbursed'));
  if not allowed then return null; end if;

  if p_to_status = 'submitted' then
    insert into app.approval_requests(
      tenant_id, target_type, target_id, request_type, status,
      requested_by, requested_at, request_note, metadata
    ) values (
      tenant, 'expense', target.id, 'expense_approval', 'pending',
      auth.uid(), statement_timestamp(), reason,
      jsonb_build_object('expense_row_version', target.row_version,
        'request_id', nullif(p_request_id, ''))
    ) returning * into approval;
  elsif p_to_status in ('approved','rejected') then
    select ar.* into approval from app.approval_requests ar
    where ar.tenant_id = tenant and ar.target_type = 'expense'
      and ar.target_id = target.id and ar.request_type = 'expense_approval'
      and ar.status = 'pending'
    order by ar.created_at desc, ar.id desc limit 1 for update;
    if not found then return null; end if;
    update app.approval_requests set
      status = case when p_to_status = 'approved' then 'approved' else 'rejected' end,
      completed_at = statement_timestamp(), decision_note = reason
    where id = approval.id returning * into approval;
  elsif p_to_status = 'cancelled' and target.status = 'submitted' then
    update app.approval_requests set status = 'cancelled',
      completed_at = statement_timestamp(), decision_note = reason
    where tenant_id = tenant and target_type = 'expense' and target_id = target.id
      and request_type = 'expense_approval' and status = 'pending';
  end if;

  update app.expense_records set
    status = p_to_status,
    approved_at = case when p_to_status = 'approved' then statement_timestamp()
      when p_to_status in ('rejected','cancelled') then null else approved_at end,
    approved_by = case when p_to_status = 'approved' then auth.uid()
      when p_to_status in ('rejected','cancelled') then null else approved_by end,
    updated_by = auth.uid()
  where id = target.id returning * into saved;

  insert into app.expense_status_histories(
    tenant_id, expense_id, from_status, to_status, change_reason, changed_by,
    metadata
  ) values (
    tenant, saved.id, target.status, saved.status, reason, auth.uid(),
    jsonb_build_object('approval_request_id', approval.id,
      'request_id', nullif(p_request_id, ''))
  );
  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'expense.status_changed', 'expense', saved.id,
    nullif(p_request_id, ''),
    jsonb_build_object('status', target.status, 'row_version', target.row_version),
    jsonb_build_object('status', saved.status, 'row_version', saved.row_version),
    jsonb_build_object('reason', reason, 'approval_request_id', approval.id)
  );
  return jsonb_build_object('id', saved.id);
end
$$;

revoke all on function public.list_expense_records(text, text, date, date, integer)
  from public, anon, authenticated;
revoke all on function public.get_expense_record_detail(uuid)
  from public, anon, authenticated;
revoke all on function public.save_expense_record(uuid, bigint, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.transition_expense_status(uuid, bigint, text, text, text)
  from public, anon, authenticated;
grant execute on function public.list_expense_records(text, text, date, date, integer)
  to authenticated;
grant execute on function public.get_expense_record_detail(uuid)
  to authenticated;
grant execute on function public.save_expense_record(uuid, bigint, jsonb, text)
  to authenticated;
grant execute on function public.transition_expense_status(uuid, bigint, text, text, text)
  to authenticated;

comment on function public.save_expense_record(uuid, bigint, jsonb, text) is
  'Creates or revises an expense draft while keeping sensitive receipt and notes fields behind the detail RPC.';
comment on function public.transition_expense_status(uuid, bigint, text, text, text) is
  'Applies the expense submission, approval, rejection, cancellation, invoicing, and reimbursement state machine atomically.';

commit;
