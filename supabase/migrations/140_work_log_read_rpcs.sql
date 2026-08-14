-- SES Navigator
-- Migration: 140_work_log_read_rpcs
-- Purpose: Expose authorized monthly work-log list and detail reads without
--          granting authenticated users direct access to work-log tables.

begin;

create or replace function public.list_work_log_summaries(
  p_query text default null,
  p_status text default null,
  p_work_month date default null,
  p_limit integer default 50,
  p_cursor_work_month date default null,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  normalized_query text := nullif(btrim(p_query), '');
  result jsonb;
begin
  if auth.uid() is null or tenant is null
     or p_limit is null or p_limit < 1 or p_limit > 200
     or length(coalesce(normalized_query, '')) > 100
     or (p_status is not null and p_status not in (
       'draft','submitted','approved','rejected','locked'
     ))
     or (p_work_month is not null and p_work_month <> date_trunc('month', p_work_month)::date)
     or ((p_cursor_work_month is null) <> (p_cursor_updated_at is null))
     or ((p_cursor_updated_at is null) <> (p_cursor_id is null))
  then
    raise exception 'invalid work log list request' using errcode = '22023';
  end if;

  with visible as (
    select
      w.id,
      w.contract_id,
      w.engineer_id,
      c.title as contract_title,
      coalesce(nullif(e.display_name, ''), concat_ws(' ', e.family_name, e.given_name)) as engineer_name,
      w.work_month,
      w.status,
      w.scheduled_days,
      w.actual_days,
      w.scheduled_hours,
      w.actual_hours,
      w.overtime_hours,
      w.absence_hours,
      w.customer_approved_at,
      w.updated_at,
      w.row_version
    from app.work_logs w
    join app.contracts c
      on c.tenant_id = w.tenant_id and c.id = w.contract_id and c.deleted_at is null
    join app.engineers e
      on e.tenant_id = w.tenant_id and e.id = w.engineer_id and e.deleted_at is null
    where w.tenant_id = tenant
      and w.deleted_at is null
      and app.can_access_contract(w.contract_id, 'contract.read', 'view')
      and (p_status is null or w.status = p_status)
      and (p_work_month is null or w.work_month = p_work_month)
      and (
        normalized_query is null
        or c.contract_no ilike '%' || normalized_query || '%'
        or c.title ilike '%' || normalized_query || '%'
        or coalesce(e.display_name, '') ilike '%' || normalized_query || '%'
        or concat_ws(' ', e.family_name, e.given_name) ilike '%' || normalized_query || '%'
      )
      and (
        p_cursor_work_month is null
        or (w.work_month, w.updated_at, w.id) < (
          p_cursor_work_month, p_cursor_updated_at, p_cursor_id
        )
      )
    order by w.work_month desc, w.updated_at desc, w.id desc
    limit p_limit + 1
  ), page as (
    select * from visible
    order by work_month desc, updated_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'contract_id', p.contract_id,
        'engineer_id', p.engineer_id,
        'contract_title', p.contract_title,
        'engineer_name', p.engineer_name,
        'work_month', p.work_month,
        'status', p.status,
        'scheduled_days', p.scheduled_days,
        'actual_days', p.actual_days,
        'scheduled_hours', p.scheduled_hours,
        'actual_hours', p.actual_hours,
        'overtime_hours', p.overtime_hours,
        'absence_hours', p.absence_hours,
        'customer_approved_at', p.customer_approved_at,
        'updated_at', p.updated_at,
        'row_version', p.row_version
      ) order by p.work_month desc, p.updated_at desc, p.id desc) from page p
    ), '[]'::jsonb),
    'next_cursor', case when (select count(*) from visible) > p_limit then (
      select jsonb_build_object(
        'work_month', p.work_month, 'updated_at', p.updated_at, 'id', p.id
      ) from page p order by p.work_month, p.updated_at, p.id limit 1
    ) else null end
  ) into result;

  return result;
end
$$;

create or replace function public.get_work_log_detail(p_work_log_id uuid)
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
  if auth.uid() is null or tenant is null or p_work_log_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', w.id,
    'contract_id', w.contract_id,
    'engineer_id', w.engineer_id,
    'contract_title', c.title,
    'engineer_name', coalesce(nullif(e.display_name, ''), concat_ws(' ', e.family_name, e.given_name)),
    'work_month', w.work_month,
    'status', w.status,
    'scheduled_days', w.scheduled_days,
    'actual_days', w.actual_days,
    'scheduled_hours', w.scheduled_hours,
    'actual_hours', w.actual_hours,
    'overtime_hours', w.overtime_hours,
    'absence_hours', w.absence_hours,
    'customer_approved_at', w.customer_approved_at,
    'approved_by_name', w.approved_by_name,
    'notes', w.notes,
    'updated_at', w.updated_at,
    'row_version', w.row_version,
    'details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'work_date', d.work_date,
        'work_type', d.work_type,
        'start_time', d.start_time,
        'end_time', d.end_time,
        'break_minutes', d.break_minutes,
        'work_hours', d.work_hours,
        'overtime_hours', d.overtime_hours,
        'description', d.description,
        'updated_at', d.updated_at,
        'row_version', d.row_version
      ) order by d.work_date, d.id)
      from app.work_log_details d
      where d.tenant_id = w.tenant_id
        and d.work_log_id = w.id
        and d.deleted_at is null
    ), '[]'::jsonb)
  ) into result
  from app.work_logs w
  join app.contracts c
    on c.tenant_id = w.tenant_id and c.id = w.contract_id and c.deleted_at is null
  join app.engineers e
    on e.tenant_id = w.tenant_id and e.id = w.engineer_id and e.deleted_at is null
  where w.id = p_work_log_id
    and w.tenant_id = tenant
    and w.deleted_at is null
    and app.can_access_contract(w.contract_id, 'contract.read', 'view');

  if result is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return result;
end
$$;

revoke all on function public.list_work_log_summaries(text, text, date, integer, date, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.get_work_log_detail(uuid)
  from public, anon, authenticated;
grant execute on function public.list_work_log_summaries(text, text, date, integer, date, timestamptz, uuid)
  to authenticated;
grant execute on function public.get_work_log_detail(uuid)
  to authenticated;

comment on function public.list_work_log_summaries(text, text, date, integer, date, timestamptz, uuid) is
  'Returns an authorized cursor page of monthly work-log summaries under the parent contract boundary.';
comment on function public.get_work_log_detail(uuid) is
  'Returns one authorized monthly work log with non-deleted daily details without exposing base tables.';

commit;
