-- SES Navigator
-- Migration: 138_engagement_read_rpcs
-- Purpose: Expose authorized engagement list and detail reads without
--          granting authenticated users direct access to engagement tables.

begin;

create or replace function public.list_engagement_summaries(
  p_query text default null,
  p_status text default null,
  p_limit integer default 50,
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
       'draft','preparing','active','ending','ended','cancelled'
     ))
     or ((p_cursor_updated_at is null) <> (p_cursor_id is null))
  then
    raise exception 'invalid engagement list request' using errcode = '22023';
  end if;

  with visible as (
    select
      e.id,
      e.engagement_no,
      e.contract_id,
      e.proposal_id,
      e.engineer_id,
      coalesce(nullif(en.display_name, ''), concat_ws(' ', en.family_name, en.given_name)) as engineer_name,
      c.title as contract_title,
      e.status,
      e.planned_start_date,
      e.planned_end_date,
      e.actual_start_date,
      e.actual_end_date,
      e.role_name,
      e.work_location,
      e.remote_frequency,
      e.updated_at,
      e.row_version
    from app.engagements e
    join app.contracts c
      on c.tenant_id = e.tenant_id and c.id = e.contract_id and c.deleted_at is null
    join app.engineers en
      on en.tenant_id = e.tenant_id and en.id = e.engineer_id and en.deleted_at is null
    where e.tenant_id = tenant
      and e.deleted_at is null
      and app.can_access_engagement(e.id, 'contract.read', 'view')
      and (p_status is null or e.status = p_status)
      and (
        normalized_query is null
        or e.engagement_no ilike '%' || normalized_query || '%'
        or c.title ilike '%' || normalized_query || '%'
        or coalesce(en.display_name, '') ilike '%' || normalized_query || '%'
        or concat_ws(' ', en.family_name, en.given_name) ilike '%' || normalized_query || '%'
      )
      and (
        p_cursor_updated_at is null
        or (e.updated_at, e.id) < (p_cursor_updated_at, p_cursor_id)
      )
    order by e.updated_at desc, e.id desc
    limit p_limit + 1
  ), page as (
    select * from visible
    order by updated_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'engagement_no', p.engagement_no,
          'contract_id', p.contract_id,
          'proposal_id', p.proposal_id,
          'engineer_id', p.engineer_id,
          'engineer_name', p.engineer_name,
          'contract_title', p.contract_title,
          'status', p.status,
          'planned_start_date', p.planned_start_date,
          'planned_end_date', p.planned_end_date,
          'actual_start_date', p.actual_start_date,
          'actual_end_date', p.actual_end_date,
          'role_name', p.role_name,
          'work_location', p.work_location,
          'remote_frequency', p.remote_frequency,
          'updated_at', p.updated_at,
          'row_version', p.row_version
        ) order by p.updated_at desc, p.id desc
      ) from page p
    ), '[]'::jsonb),
    'next_cursor', case when (select count(*) from visible) > p_limit then (
      select jsonb_build_object('updated_at', p.updated_at, 'id', p.id)
      from page p order by p.updated_at, p.id limit 1
    ) else null end
  ) into result;

  return result;
end
$$;

create or replace function public.get_engagement_detail(p_engagement_id uuid)
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
  if auth.uid() is null or tenant is null or p_engagement_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', e.id,
    'engagement_no', e.engagement_no,
    'contract_id', e.contract_id,
    'proposal_id', e.proposal_id,
    'engineer_id', e.engineer_id,
    'engineer_name', coalesce(nullif(en.display_name, ''), concat_ws(' ', en.family_name, en.given_name)),
    'contract_title', c.title,
    'previous_engagement_id', e.previous_engagement_id,
    'status', e.status,
    'planned_start_date', e.planned_start_date,
    'planned_end_date', e.planned_end_date,
    'actual_start_date', e.actual_start_date,
    'actual_end_date', e.actual_end_date,
    'role_name', e.role_name,
    'work_location', e.work_location,
    'remote_frequency', e.remote_frequency,
    'updated_at', e.updated_at,
    'row_version', e.row_version,
    'conditions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ec.id,
        'version_no', ec.version_no,
        'effective_from', ec.effective_from,
        'effective_to', ec.effective_to,
        'monthly_sales_amount', ec.monthly_sales_amount,
        'monthly_cost_amount', ec.monthly_cost_amount,
        'currency', ec.currency,
        'settlement_lower_hours', ec.settlement_lower_hours,
        'settlement_upper_hours', ec.settlement_upper_hours,
        'work_location', ec.work_location,
        'remote_frequency', ec.remote_frequency,
        'notes', ec.notes,
        'created_at', ec.created_at
      ) order by ec.version_no desc)
      from app.engagement_conditions ec
      where ec.tenant_id = e.tenant_id and ec.engagement_id = e.id
    ), '[]'::jsonb),
    'status_histories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'from_status', h.from_status,
        'to_status', h.to_status,
        'change_reason', h.change_reason,
        'changed_at', h.changed_at
      ) order by h.changed_at desc, h.id desc)
      from app.engagement_status_histories h
      where h.tenant_id = e.tenant_id and h.engagement_id = e.id
    ), '[]'::jsonb)
  ) into result
  from app.engagements e
  join app.contracts c
    on c.tenant_id = e.tenant_id and c.id = e.contract_id and c.deleted_at is null
  join app.engineers en
    on en.tenant_id = e.tenant_id and en.id = e.engineer_id and en.deleted_at is null
  where e.id = p_engagement_id
    and e.tenant_id = tenant
    and e.deleted_at is null
    and app.can_access_engagement(e.id, 'contract.read', 'view');

  if result is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return result;
end
$$;

revoke all on function public.list_engagement_summaries(text, text, integer, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.get_engagement_detail(uuid)
  from public, anon, authenticated;
grant execute on function public.list_engagement_summaries(text, text, integer, timestamptz, uuid)
  to authenticated;
grant execute on function public.get_engagement_detail(uuid)
  to authenticated;

comment on function public.list_engagement_summaries(text, text, integer, timestamptz, uuid) is
  'Returns a filtered cursor page of engagement summaries after parent-contract and engagement authorization checks.';
comment on function public.get_engagement_detail(uuid) is
  'Returns one authorized engagement with condition versions and status history without exposing base tables.';

commit;
