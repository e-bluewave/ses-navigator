-- SES Navigator
-- Migration: 141_work_log_write_approval_rpc
-- Purpose: Save monthly work-log drafts and apply submission, approval,
--          rejection, and locking transitions atomically.

begin;

create table app.work_log_status_histories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  work_log_id uuid not null,
  from_status text,
  to_status text not null
    check (to_status in ('draft','submitted','approved','rejected','locked')),
  change_reason text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  foreign key (tenant_id, work_log_id)
    references app.work_logs(tenant_id, id) on delete cascade
);

create index work_log_status_histories_log_idx
  on app.work_log_status_histories(tenant_id, work_log_id, changed_at desc);

alter table app.work_log_status_histories enable row level security;
alter table app.work_log_status_histories force row level security;

create policy authorization_select
  on app.work_log_status_histories for select to authenticated
  using (exists (
    select 1 from app.work_logs w
    where w.id = app.work_log_status_histories.work_log_id
      and w.tenant_id = app.work_log_status_histories.tenant_id
      and app.can_access_contract(w.contract_id, 'contract.read', 'view')
  ));

revoke all on app.work_log_status_histories from public, anon, authenticated;

create or replace function public.save_work_log(
  p_work_log_id uuid,
  p_row_version bigint,
  p_work_log jsonb,
  p_details jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  target app.work_logs%rowtype;
  saved app.work_logs%rowtype;
  contract_row app.contracts%rowtype;
  detail jsonb;
  v_contract_id uuid;
  v_engineer_id uuid;
  v_work_month date;
  v_scheduled_days numeric(6,2);
  v_scheduled_hours numeric(8,2);
  v_absence_hours numeric(8,2);
  v_notes text;
  v_work_date date;
  v_work_type text;
  v_start_time time;
  v_end_time time;
  v_break_minutes integer;
  v_work_hours numeric(6,2);
  v_overtime_hours numeric(6,2);
  v_description text;
begin
  if auth.uid() is null or tenant is null
     or p_row_version is null or p_row_version < 0
     or p_work_log is null or p_details is null
     or jsonb_typeof(p_work_log) <> 'object'
     or jsonb_typeof(p_details) <> 'array'
     or jsonb_array_length(p_details) > 31
  then
    raise exception 'invalid work log save request' using errcode = '22023';
  end if;

  begin
    v_contract_id := (p_work_log->>'contract_id')::uuid;
    v_engineer_id := (p_work_log->>'engineer_id')::uuid;
    v_work_month := (p_work_log->>'work_month')::date;
    v_scheduled_days := nullif(p_work_log->>'scheduled_days', '')::numeric;
    v_scheduled_hours := nullif(p_work_log->>'scheduled_hours', '')::numeric;
    v_absence_hours := coalesce(nullif(p_work_log->>'absence_hours', '')::numeric, 0);
    v_notes := nullif(btrim(p_work_log->>'notes'), '');
  exception when others then
    raise exception 'invalid work log fields' using errcode = '22023';
  end;

  if v_work_month is null or v_work_month <> date_trunc('month', v_work_month)::date
     or v_scheduled_days < 0 or v_scheduled_hours < 0 or v_absence_hours < 0
     or length(coalesce(v_notes, '')) > 5000
  then
    raise exception 'invalid work log fields' using errcode = '22023';
  end if;

  select c.* into contract_row from app.contracts c
  where c.id = v_contract_id and c.tenant_id = tenant and c.deleted_at is null
    and c.status in ('active','suspended','expired','terminated')
    and app.can_access_contract(c.id, 'contract.manage', 'edit');
  if not found
     or (contract_row.engineer_id is not null and contract_row.engineer_id <> v_engineer_id)
     or v_work_month < date_trunc('month', contract_row.start_date)::date
     or (contract_row.end_date is not null
       and v_work_month > date_trunc('month', contract_row.end_date)::date)
     or not exists (
       select 1 from app.engineers e
       where e.id = v_engineer_id and e.tenant_id = tenant and e.deleted_at is null
         and app.can_access_engineer(e.id, 'engineer.read', 'view')
     )
  then return null; end if;

  if exists (
    select 1 from app.work_logs w
    where w.tenant_id = tenant and w.contract_id = v_contract_id
      and w.engineer_id = v_engineer_id and w.work_month = v_work_month
      and (p_work_log_id is null or w.id <> p_work_log_id)
  ) then return null; end if;

  if exists (
    select 1 from (
      select value->>'work_date' as work_date, count(*)
      from jsonb_array_elements(p_details)
      group by value->>'work_date' having count(*) > 1
    ) duplicates
  ) then
    raise exception 'duplicate work date' using errcode = '22023';
  end if;

  if p_work_log_id is null then
    if p_row_version <> 0 then return null; end if;
    insert into app.work_logs(
      tenant_id, contract_id, engineer_id, work_month, status,
      scheduled_days, scheduled_hours, actual_days, actual_hours,
      overtime_hours, absence_hours, notes, created_by, updated_by
    ) values (
      tenant, v_contract_id, v_engineer_id, v_work_month, 'draft',
      v_scheduled_days, v_scheduled_hours, 0, 0, 0, v_absence_hours,
      v_notes, auth.uid(), auth.uid()
    ) returning * into saved;
    insert into app.work_log_status_histories(
      tenant_id, work_log_id, from_status, to_status, change_reason, changed_by
    ) values (tenant, saved.id, null, 'draft', 'Monthly work log created', auth.uid());
  else
    select w.* into target from app.work_logs w
    where w.id = p_work_log_id and w.tenant_id = tenant and w.deleted_at is null
      and app.can_access_contract(w.contract_id, 'contract.manage', 'edit')
    for update;
    if not found or target.row_version <> p_row_version
       or target.status not in ('draft','rejected')
       or target.contract_id <> v_contract_id
       or target.engineer_id <> v_engineer_id
       or target.work_month <> v_work_month
    then return null; end if;
    update app.work_logs set
      scheduled_days = v_scheduled_days,
      scheduled_hours = v_scheduled_hours,
      absence_hours = v_absence_hours,
      notes = v_notes,
      updated_by = auth.uid()
    where id = target.id returning * into saved;
    delete from app.work_log_details
    where tenant_id = tenant and work_log_id = saved.id;
  end if;

  for detail in select value from jsonb_array_elements(p_details)
  loop
    begin
      if jsonb_typeof(detail) <> 'object' then raise exception 'invalid detail'; end if;
      v_work_date := (detail->>'work_date')::date;
      v_work_type := btrim(detail->>'work_type');
      v_start_time := nullif(detail->>'start_time', '')::time;
      v_end_time := nullif(detail->>'end_time', '')::time;
      v_break_minutes := coalesce(nullif(detail->>'break_minutes', '')::integer, 0);
      v_work_hours := coalesce(nullif(detail->>'work_hours', '')::numeric, 0);
      v_overtime_hours := coalesce(nullif(detail->>'overtime_hours', '')::numeric, 0);
      v_description := nullif(btrim(detail->>'description'), '');
    exception when others then
      raise exception 'invalid work log detail' using errcode = '22023';
    end;
    if v_work_date < v_work_month
       or v_work_date >= (v_work_month + interval '1 month')::date
       or v_work_type not in ('work','paid_leave','absence','holiday','training','other')
       or v_break_minutes < 0 or v_break_minutes > 1440
       or v_work_hours < 0 or v_work_hours > 24
       or v_overtime_hours < 0 or v_overtime_hours > 24
       or (v_start_time is null) <> (v_end_time is null)
       or (v_start_time is not null and v_end_time <= v_start_time)
       or length(coalesce(v_description, '')) > 1000
    then
      raise exception 'invalid work log detail' using errcode = '22023';
    end if;
    insert into app.work_log_details(
      tenant_id, work_log_id, work_date, work_type, start_time, end_time,
      break_minutes, work_hours, overtime_hours, description, created_by, updated_by
    ) values (
      tenant, saved.id, v_work_date, v_work_type, v_start_time, v_end_time,
      v_break_minutes, v_work_hours, v_overtime_hours, v_description,
      auth.uid(), auth.uid()
    );
  end loop;

  update app.work_logs w set
    actual_days = coalesce((select count(*)::numeric from app.work_log_details d
      where d.tenant_id = tenant and d.work_log_id = w.id
        and d.work_type in ('work','training') and d.work_hours > 0), 0),
    actual_hours = coalesce((select sum(d.work_hours) from app.work_log_details d
      where d.tenant_id = tenant and d.work_log_id = w.id), 0),
    overtime_hours = coalesce((select sum(d.overtime_hours) from app.work_log_details d
      where d.tenant_id = tenant and d.work_log_id = w.id), 0),
    updated_by = auth.uid()
  where w.id = saved.id returning * into saved;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user',
    case when p_work_log_id is null then 'work_log.created' else 'work_log.updated' end,
    'work_log', saved.id, nullif(p_request_id, ''),
    case when p_work_log_id is null then null
      else jsonb_build_object('status', target.status, 'row_version', target.row_version) end,
    jsonb_build_object('status', saved.status, 'row_version', saved.row_version),
    jsonb_build_object('detail_count', jsonb_array_length(p_details))
  );
  return jsonb_build_object('id', saved.id);
end
$$;

create or replace function public.transition_work_log_status(
  p_work_log_id uuid,
  p_row_version bigint,
  p_to_status text,
  p_reason text default null,
  p_approved_by_name text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  target app.work_logs%rowtype;
  saved app.work_logs%rowtype;
  approval app.approval_requests%rowtype;
  reason text := nullif(btrim(p_reason), '');
  approver_name text := nullif(btrim(p_approved_by_name), '');
  permission text;
begin
  if auth.uid() is null or tenant is null or p_work_log_id is null
     or p_row_version is null or p_row_version < 1
     or p_to_status not in ('submitted','approved','rejected','locked')
     or length(coalesce(reason, '')) > 1000
     or length(coalesce(approver_name, '')) > 300
     or (p_to_status = 'rejected' and reason is null)
     or (p_to_status = 'approved' and approver_name is null)
  then
    raise exception 'invalid work log status request' using errcode = '22023';
  end if;

  select w.* into target from app.work_logs w
  where w.id = p_work_log_id and w.tenant_id = tenant and w.deleted_at is null
  for update;
  if not found or target.row_version <> p_row_version then return null; end if;

  permission := case
    when target.status in ('draft','rejected') and p_to_status = 'submitted'
      then 'contract.manage'
    when target.status = 'submitted' and p_to_status in ('approved','rejected')
      then 'contract.approve'
    when target.status = 'approved' and p_to_status = 'locked'
      then 'contract.approve'
    else null
  end;
  if permission is null
     or not app.can_access_contract(target.contract_id, permission, 'edit')
  then return null; end if;

  if p_to_status = 'submitted' then
    if not exists (
      select 1 from app.work_log_details d
      where d.tenant_id = tenant and d.work_log_id = target.id and d.deleted_at is null
    ) then return null; end if;
    insert into app.approval_requests(
      tenant_id, target_type, target_id, request_type, status,
      requested_by, requested_at, request_note, metadata
    ) values (
      tenant, 'work_log', target.id, 'work_log_approval', 'pending',
      auth.uid(), statement_timestamp(), reason,
      jsonb_build_object('work_log_row_version', target.row_version, 'request_id', nullif(p_request_id, ''))
    ) returning * into approval;
  elsif p_to_status in ('approved','rejected') then
    select ar.* into approval from app.approval_requests ar
    where ar.tenant_id = tenant and ar.target_type = 'work_log'
      and ar.target_id = target.id and ar.request_type = 'work_log_approval'
      and ar.status = 'pending'
    order by ar.created_at desc, ar.id desc limit 1 for update;
    if not found then return null; end if;
    update app.approval_requests set
      status = case when p_to_status = 'approved' then 'approved' else 'rejected' end,
      completed_at = statement_timestamp(), decision_note = reason
    where id = approval.id returning * into approval;
  else
    select ar.* into approval from app.approval_requests ar
    where ar.tenant_id = tenant and ar.target_type = 'work_log'
      and ar.target_id = target.id and ar.request_type = 'work_log_approval'
      and ar.status = 'approved'
    order by ar.created_at desc, ar.id desc limit 1;
    if not found then return null; end if;
  end if;

  update app.work_logs set
    status = p_to_status,
    customer_approved_at = case
      when p_to_status = 'approved' then statement_timestamp()
      when p_to_status = 'rejected' then null else customer_approved_at end,
    approved_by_name = case
      when p_to_status = 'approved' then approver_name
      when p_to_status = 'rejected' then null else approved_by_name end,
    updated_by = auth.uid()
  where id = target.id returning * into saved;

  insert into app.work_log_status_histories(
    tenant_id, work_log_id, from_status, to_status, change_reason, changed_by,
    metadata
  ) values (
    tenant, saved.id, target.status, saved.status, reason, auth.uid(),
    jsonb_build_object('approval_request_id', approval.id, 'request_id', nullif(p_request_id, ''))
  );
  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'work_log.status_changed', 'work_log', saved.id,
    nullif(p_request_id, ''),
    jsonb_build_object('status', target.status, 'row_version', target.row_version),
    jsonb_build_object('status', saved.status, 'row_version', saved.row_version),
    jsonb_build_object('approval_request_id', approval.id, 'reason', reason)
  );
  return jsonb_build_object('id', saved.id);
end
$$;

create or replace function public.get_work_log_detail(p_work_log_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from app.work_logs w
    where w.id = p_work_log_id and w.tenant_id = app.current_tenant_id()
      and w.deleted_at is null
      and app.can_access_contract(w.contract_id, 'contract.read', 'view')
  ) then raise exception 'forbidden' using errcode = '42501'; end if;

  select jsonb_build_object(
    'id', w.id, 'contract_id', w.contract_id, 'engineer_id', w.engineer_id,
    'contract_title', c.title,
    'engineer_name', coalesce(nullif(e.display_name, ''), concat_ws(' ', e.family_name, e.given_name)),
    'work_month', w.work_month, 'status', w.status,
    'scheduled_days', w.scheduled_days, 'actual_days', w.actual_days,
    'scheduled_hours', w.scheduled_hours, 'actual_hours', w.actual_hours,
    'overtime_hours', w.overtime_hours, 'absence_hours', w.absence_hours,
    'customer_approved_at', w.customer_approved_at,
    'approved_by_name', w.approved_by_name, 'notes', w.notes,
    'updated_at', w.updated_at, 'row_version', w.row_version,
    'details', coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'work_date', d.work_date, 'work_type', d.work_type,
      'start_time', d.start_time, 'end_time', d.end_time,
      'break_minutes', d.break_minutes, 'work_hours', d.work_hours,
      'overtime_hours', d.overtime_hours, 'description', d.description,
      'updated_at', d.updated_at, 'row_version', d.row_version
    ) order by d.work_date, d.id) from app.work_log_details d
      where d.tenant_id = w.tenant_id and d.work_log_id = w.id and d.deleted_at is null), '[]'::jsonb),
    'status_histories', coalesce((select jsonb_agg(jsonb_build_object(
      'id', h.id, 'from_status', h.from_status, 'to_status', h.to_status,
      'change_reason', h.change_reason, 'changed_at', h.changed_at
    ) order by h.changed_at desc, h.id desc) from app.work_log_status_histories h
      where h.tenant_id = w.tenant_id and h.work_log_id = w.id), '[]'::jsonb),
    'approval', (select jsonb_build_object(
      'id', ar.id, 'status', ar.status, 'requested_at', ar.requested_at,
      'completed_at', ar.completed_at, 'request_note', ar.request_note,
      'decision_note', ar.decision_note
    ) from app.approval_requests ar
      where ar.tenant_id = w.tenant_id and ar.target_type = 'work_log'
        and ar.target_id = w.id and ar.request_type = 'work_log_approval'
      order by ar.created_at desc, ar.id desc limit 1)
  ) into result
  from app.work_logs w
  join app.contracts c on c.tenant_id=w.tenant_id and c.id=w.contract_id and c.deleted_at is null
  join app.engineers e on e.tenant_id=w.tenant_id and e.id=w.engineer_id and e.deleted_at is null
  where w.id=p_work_log_id and w.tenant_id=app.current_tenant_id() and w.deleted_at is null;
  return result;
end
$$;

revoke all on function public.save_work_log(uuid, bigint, jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.transition_work_log_status(uuid, bigint, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_work_log(uuid, bigint, jsonb, jsonb, text)
  to authenticated;
grant execute on function public.transition_work_log_status(uuid, bigint, text, text, text, text)
  to authenticated;

comment on function public.save_work_log(uuid, bigint, jsonb, jsonb, text) is
  'Creates or updates an authorized monthly work-log draft, replaces daily details, recalculates totals, and audits the mutation.';
comment on function public.transition_work_log_status(uuid, bigint, text, text, text, text) is
  'Submits, approves, rejects, or locks one monthly work log with approval, status history, and audit state kept atomic.';

commit;
