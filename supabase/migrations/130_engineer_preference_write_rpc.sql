-- SES Navigator
-- Migration: 130_engineer_preference_write_rpc
-- Purpose: Save an engineer's current work preferences through an authorized RPC.

begin;

create or replace function public.save_engineer_preference(
  p_engineer_id uuid,
  p_preference_id uuid,
  p_row_version bigint,
  p_preference jsonb,
  p_locations jsonb default '[]'::jsonb,
  p_contract_types jsonb default '[]'::jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid;
  target app.engineer_preferences%rowtype;
  saved app.engineer_preferences%rowtype;
  effective_from_value date;
  effective_to_value date;
begin
  if auth.uid() is null or p_engineer_id is null or p_row_version is null
     or p_row_version < 0 or jsonb_typeof(p_preference) <> 'object'
     or jsonb_typeof(p_locations) <> 'array'
     or jsonb_typeof(p_contract_types) <> 'array'
     or not app.can_access_engineer(p_engineer_id, 'engineer.manage', 'edit') then
    raise exception 'engineer preference is not manageable' using errcode = '42501';
  end if;
  tenant := app.current_tenant_id();
  effective_from_value := nullif(p_preference->>'effective_from', '')::date;
  effective_to_value := nullif(p_preference->>'effective_to', '')::date;
  if effective_from_value is null
     or (effective_to_value is not null and effective_to_value < effective_from_value)
     or coalesce(p_preference->>'remote_preference', '') not in ('onsite','hybrid','remote','flexible')
     or jsonb_array_length(p_locations) > 20 or jsonb_array_length(p_contract_types) > 10 then
    raise exception 'invalid engineer preference' using errcode = '22023';
  end if;

  if p_preference_id is null then
    if p_row_version <> 0 then return null; end if;
    insert into app.engineer_preferences(
      tenant_id, engineer_id, effective_from, effective_to, desired_rate_min,
      desired_rate_max, currency_code, remote_preference, weekly_days_min,
      weekly_days_max, overtime_limit_hours, available_from, notes, created_by, updated_by
    ) values (
      tenant, p_engineer_id, effective_from_value, effective_to_value,
      nullif(p_preference->>'desired_rate_min','')::bigint,
      nullif(p_preference->>'desired_rate_max','')::bigint,
      coalesce(nullif(p_preference->>'currency_code',''),'JPY'),
      p_preference->>'remote_preference',
      nullif(p_preference->>'weekly_days_min','')::numeric,
      nullif(p_preference->>'weekly_days_max','')::numeric,
      nullif(p_preference->>'overtime_limit_hours','')::numeric,
      nullif(p_preference->>'available_from','')::date,
      nullif(p_preference->>'notes',''), auth.uid(), auth.uid()
    ) returning * into saved;
  else
    select p.* into target from app.engineer_preferences p
      where p.id = p_preference_id and p.engineer_id = p_engineer_id
        and p.tenant_id = tenant for update;
    if not found or target.row_version <> p_row_version then return null; end if;
    update app.engineer_preferences set
      effective_from = effective_from_value, effective_to = effective_to_value,
      desired_rate_min = nullif(p_preference->>'desired_rate_min','')::bigint,
      desired_rate_max = nullif(p_preference->>'desired_rate_max','')::bigint,
      currency_code = coalesce(nullif(p_preference->>'currency_code',''),'JPY'),
      remote_preference = p_preference->>'remote_preference',
      weekly_days_min = nullif(p_preference->>'weekly_days_min','')::numeric,
      weekly_days_max = nullif(p_preference->>'weekly_days_max','')::numeric,
      overtime_limit_hours = nullif(p_preference->>'overtime_limit_hours','')::numeric,
      available_from = nullif(p_preference->>'available_from','')::date,
      notes = nullif(p_preference->>'notes',''), updated_by = auth.uid()
    where id = target.id returning * into saved;
  end if;

  delete from app.engineer_preferred_locations
    where tenant_id = tenant and engineer_id = p_engineer_id;
  insert into app.engineer_preferred_locations(
    tenant_id, engineer_id, prefecture, city, station_name, max_commute_minutes,
    priority, created_by
  )
  select tenant, p_engineer_id, nullif(x.value->>'prefecture',''),
    nullif(x.value->>'city',''), nullif(x.value->>'station_name',''),
    nullif(x.value->>'max_commute_minutes','')::integer, x.ordinality::smallint,
    auth.uid()
  from jsonb_array_elements(p_locations) with ordinality x(value, ordinality);

  delete from app.engineer_preferred_contract_types
    where tenant_id = tenant and engineer_id = p_engineer_id;
  insert into app.engineer_preferred_contract_types(
    tenant_id, engineer_id, contract_type, priority, created_by
  )
  select tenant, p_engineer_id, x.value#>>'{}', x.ordinality::smallint, auth.uid()
  from jsonb_array_elements(p_contract_types) with ordinality x(value, ordinality);

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, metadata
  ) values (
    tenant, auth.uid(), 'user', 'engineer.preference_saved', 'engineer',
    p_engineer_id, nullif(p_request_id,''),
    jsonb_build_object('preference_id', saved.id, 'is_new', p_preference_id is null)
  );
  return to_jsonb(saved) - array['tenant_id','created_by','updated_by','created_at'];
end
$$;

revoke all on function public.save_engineer_preference(uuid,uuid,bigint,jsonb,jsonb,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.save_engineer_preference(uuid,uuid,bigint,jsonb,jsonb,jsonb,text)
  to authenticated;

commit;
