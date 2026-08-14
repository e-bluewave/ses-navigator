-- SES Navigator
-- Migration: 139_engagement_write_status_rpc
-- Purpose: Save engagement drafts and apply authorized lifecycle transitions atomically.

begin;

create or replace function public.save_engagement(
  p_engagement_id uuid,
  p_row_version bigint,
  p_engagement jsonb,
  p_condition jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  target app.engagements%rowtype;
  saved app.engagements%rowtype;
  contract_row app.contracts%rowtype;
  previous_row app.engagements%rowtype;
  condition_row app.engagement_conditions%rowtype;
  v_engagement_no text;
  v_contract_id uuid;
  v_engineer_id uuid;
  v_previous_id uuid;
  v_planned_start date;
  v_planned_end date;
  v_role_name text;
  v_work_location text;
  v_remote_frequency text;
  v_effective_from date;
  v_effective_to date;
  v_sales numeric(14,2);
  v_cost numeric(14,2);
  v_currency text;
  v_lower numeric(8,2);
  v_upper numeric(8,2);
  v_notes text;
begin
  if auth.uid() is null or tenant is null or p_row_version is null or p_row_version < 0
     or p_engagement is null or p_condition is null
     or jsonb_typeof(p_engagement) <> 'object' or jsonb_typeof(p_condition) <> 'object'
  then
    raise exception 'invalid engagement save request' using errcode = '22023';
  end if;

  begin
    v_engagement_no := btrim(p_engagement->>'engagement_no');
    v_contract_id := (p_engagement->>'contract_id')::uuid;
    v_engineer_id := (p_engagement->>'engineer_id')::uuid;
    v_previous_id := nullif(p_engagement->>'previous_engagement_id', '')::uuid;
    v_planned_start := nullif(p_engagement->>'planned_start_date', '')::date;
    v_planned_end := nullif(p_engagement->>'planned_end_date', '')::date;
    v_role_name := nullif(btrim(p_engagement->>'role_name'), '');
    v_work_location := nullif(btrim(p_engagement->>'work_location'), '');
    v_remote_frequency := nullif(btrim(p_engagement->>'remote_frequency'), '');
    v_effective_from := (p_condition->>'effective_from')::date;
    v_effective_to := nullif(p_condition->>'effective_to', '')::date;
    v_sales := nullif(p_condition->>'monthly_sales_amount', '')::numeric;
    v_cost := nullif(p_condition->>'monthly_cost_amount', '')::numeric;
    v_currency := upper(btrim(coalesce(p_condition->>'currency', 'JPY')));
    v_lower := nullif(p_condition->>'settlement_lower_hours', '')::numeric;
    v_upper := nullif(p_condition->>'settlement_upper_hours', '')::numeric;
    v_notes := nullif(btrim(p_condition->>'notes'), '');
  exception when others then
    raise exception 'invalid engagement fields' using errcode = '22023';
  end;

  if length(coalesce(v_engagement_no, '')) not between 1 and 32
     or v_planned_start is null
     or (v_planned_end is not null and v_planned_end < v_planned_start)
     or length(coalesce(v_role_name, '')) > 300
     or length(coalesce(v_work_location, '')) > 500
     or length(coalesce(v_remote_frequency, '')) > 200
     or v_effective_from is null
     or (v_effective_to is not null and v_effective_to < v_effective_from)
     or v_sales < 0 or v_cost < 0 or v_lower < 0 or v_upper < 0
     or (v_lower is not null and v_upper is not null and v_upper < v_lower)
     or v_currency !~ '^[A-Z]{3}$'
     or length(coalesce(v_notes, '')) > 5000
  then
    raise exception 'invalid engagement fields' using errcode = '22023';
  end if;

  select c.* into contract_row
  from app.contracts c
  where c.id = v_contract_id and c.tenant_id = tenant and c.deleted_at is null
    and app.can_access_contract(c.id, 'contract.manage', 'edit');
  if not found or contract_row.status not in ('draft','review','active')
     or (contract_row.engineer_id is not null and contract_row.engineer_id <> v_engineer_id)
     or not exists (
       select 1 from app.engineers e where e.id=v_engineer_id and e.tenant_id=tenant
         and e.deleted_at is null and app.can_access_engineer(e.id, 'engineer.read', 'view')
     )
  then return null; end if;

  if v_previous_id is not null then
    select e.* into previous_row from app.engagements e
    where e.id=v_previous_id and e.tenant_id=tenant and e.deleted_at is null
      and e.contract_id=v_contract_id and e.engineer_id=v_engineer_id
      and e.status in ('ended','cancelled')
      and app.can_access_engagement(e.id, 'contract.read', 'view');
    if not found then return null; end if;
  end if;

  if exists (
    select 1 from app.engagements e where e.tenant_id=tenant
      and e.engagement_no=v_engagement_no and e.deleted_at is null
      and (p_engagement_id is null or e.id <> p_engagement_id)
  ) then return null; end if;

  if p_engagement_id is null then
    if p_row_version <> 0 or contract_row.status <> 'active' then return null; end if;
    insert into app.engagements(
      tenant_id, engagement_no, contract_id, engineer_id, previous_engagement_id,
      status, planned_start_date, planned_end_date, role_name, work_location,
      remote_frequency, primary_owner_user_id, owner_organization_id, created_by, updated_by
    ) values (
      tenant, v_engagement_no, v_contract_id, v_engineer_id, v_previous_id,
      'draft', v_planned_start, v_planned_end, v_role_name, v_work_location,
      v_remote_frequency, contract_row.primary_owner_user_id,
      contract_row.owner_organization_id, auth.uid(), auth.uid()
    ) returning * into saved;
    insert into app.engagement_status_histories(
      tenant_id, engagement_id, from_status, to_status, change_reason, changed_by
    ) values (tenant, saved.id, null, 'draft', 'Manual engagement draft created', auth.uid());
  else
    select e.* into target from app.engagements e
    where e.id=p_engagement_id and e.tenant_id=tenant and e.deleted_at is null
      and app.can_access_engagement(e.id, 'contract.manage', 'edit') for update;
    if not found or target.row_version <> p_row_version or target.status <> 'draft'
       or target.contract_id <> v_contract_id or target.engineer_id <> v_engineer_id
    then return null; end if;
    update app.engagements set
      engagement_no=v_engagement_no, contract_id=v_contract_id, engineer_id=v_engineer_id,
      previous_engagement_id=v_previous_id, planned_start_date=v_planned_start,
      planned_end_date=v_planned_end, role_name=v_role_name,
      work_location=v_work_location, remote_frequency=v_remote_frequency,
      primary_owner_user_id=contract_row.primary_owner_user_id,
      owner_organization_id=contract_row.owner_organization_id, updated_by=auth.uid()
    where id=target.id returning * into saved;
  end if;

  select ec.* into condition_row from app.engagement_conditions ec
  where ec.tenant_id=tenant and ec.engagement_id=saved.id
  order by ec.version_no desc limit 1 for update;
  if found then
    update app.engagement_conditions set
      effective_from=v_effective_from, effective_to=v_effective_to,
      monthly_sales_amount=v_sales, monthly_cost_amount=v_cost, currency=v_currency,
      settlement_lower_hours=v_lower, settlement_upper_hours=v_upper,
      work_location=v_work_location, remote_frequency=v_remote_frequency, notes=v_notes
    where id=condition_row.id;
  else
    insert into app.engagement_conditions(
      tenant_id, engagement_id, version_no, effective_from, effective_to,
      monthly_sales_amount, monthly_cost_amount, currency, settlement_lower_hours,
      settlement_upper_hours, work_location, remote_frequency, notes, created_by
    ) values (
      tenant, saved.id, 1, v_effective_from, v_effective_to, v_sales, v_cost,
      v_currency, v_lower, v_upper, v_work_location, v_remote_frequency, v_notes, auth.uid()
    );
  end if;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data
  ) values (
    tenant, auth.uid(), 'user', case when p_engagement_id is null then 'engagement.created' else 'engagement.updated' end,
    'engagement', saved.id, nullif(p_request_id, ''),
    case when p_engagement_id is null then null else jsonb_build_object('row_version', target.row_version) end,
    jsonb_build_object('status', saved.status, 'row_version', saved.row_version)
  );
  return jsonb_build_object('id', saved.id);
end
$$;

create or replace function public.transition_engagement_status(
  p_engagement_id uuid,
  p_row_version bigint,
  p_to_status text,
  p_change_reason text default null,
  p_actual_date date default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  target app.engagements%rowtype;
  saved app.engagements%rowtype;
  reason text := nullif(btrim(p_change_reason), '');
begin
  if auth.uid() is null or tenant is null or p_engagement_id is null
     or p_row_version is null or p_row_version < 1
     or p_to_status not in ('preparing','active','ending','ended','cancelled')
     or length(coalesce(reason, '')) > 1000
     or (p_to_status in ('ended','cancelled') and reason is null)
  then raise exception 'invalid engagement status request' using errcode='22023'; end if;

  select e.* into target from app.engagements e
  where e.id=p_engagement_id and e.tenant_id=tenant and e.deleted_at is null
    and app.can_access_engagement(e.id, 'contract.manage', 'edit') for update;
  if not found or target.row_version <> p_row_version then return null; end if;
  if not (
    (target.status='draft' and p_to_status in ('preparing','cancelled'))
    or (target.status='preparing' and p_to_status in ('active','cancelled'))
    or (target.status='active' and p_to_status='ending')
    or (target.status='ending' and p_to_status='ended')
  ) then return null; end if;
  if p_to_status in ('preparing','active') and not exists (
    select 1 from app.contracts c where c.id=target.contract_id and c.tenant_id=tenant
      and c.deleted_at is null and c.status='active'
  ) then return null; end if;

  update app.engagements set
    status=p_to_status,
    actual_start_date=case when p_to_status='active' then coalesce(p_actual_date, current_date) else actual_start_date end,
    actual_end_date=case when p_to_status='ended' then coalesce(p_actual_date, current_date) else actual_end_date end,
    updated_by=auth.uid()
  where id=target.id returning * into saved;
  if saved.actual_end_date is not null and saved.actual_start_date is not null
     and saved.actual_end_date < saved.actual_start_date
  then raise exception 'actual end date is before start date' using errcode='22023'; end if;

  insert into app.engagement_status_histories(
    tenant_id, engagement_id, from_status, to_status, change_reason, changed_by,
    metadata
  ) values (
    tenant, saved.id, target.status, saved.status, reason, auth.uid(),
    jsonb_build_object('request_id', nullif(p_request_id, ''), 'actual_date', p_actual_date)
  );
  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'engagement.status_changed', 'engagement', saved.id,
    nullif(p_request_id, ''),
    jsonb_build_object('status', target.status, 'row_version', target.row_version),
    jsonb_build_object('status', saved.status, 'row_version', saved.row_version),
    jsonb_build_object('reason', reason, 'actual_date', p_actual_date)
  );
  return jsonb_build_object('id', saved.id);
end
$$;

revoke all on function public.save_engagement(uuid, bigint, jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.transition_engagement_status(uuid, bigint, text, text, date, text)
  from public, anon, authenticated;
grant execute on function public.save_engagement(uuid, bigint, jsonb, jsonb, text)
  to authenticated;
grant execute on function public.transition_engagement_status(uuid, bigint, text, text, date, text)
  to authenticated;

comment on function public.save_engagement(uuid, bigint, jsonb, jsonb, text) is
  'Creates a manual re-engagement draft or updates a draft with its initial condition under contract.manage and optimistic locking.';
comment on function public.transition_engagement_status(uuid, bigint, text, text, date, text) is
  'Applies the authorized engagement lifecycle with status history and audit records.';

commit;
