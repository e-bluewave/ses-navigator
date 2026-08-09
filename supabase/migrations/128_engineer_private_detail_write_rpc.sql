-- SES Navigator
-- Migration: 128_engineer_private_detail_write_rpc
-- Purpose: Read and write one engineer's private detail through permission-checked RPCs.

begin;

create or replace function public.get_engineer_private_detail(p_engineer_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog
as $$
declare result jsonb;
begin
  if auth.uid() is null then
    raise exception 'engineer private detail is not accessible' using errcode = '42501';
  end if;
  if not app.can_access_engineer(p_engineer_id, 'engineer.private.read', 'view') then
    return null;
  end if;
  select jsonb_build_object(
    'engineer_id', d.engineer_id, 'birth_date', d.birth_date, 'gender', d.gender,
    'personal_email', d.personal_email, 'phone', d.phone, 'postal_code', d.postal_code,
    'prefecture', d.prefecture, 'city', d.city, 'address_line', d.address_line,
    'emergency_contact', d.emergency_contact, 'notes', d.notes,
    'updated_at', d.updated_at, 'row_version', d.row_version
  ) into result
  from app.engineer_private_details d
  where d.engineer_id = p_engineer_id and d.tenant_id = app.current_tenant_id();
  return result;
end
$$;

create or replace function public.upsert_engineer_private_detail(
  p_engineer_id uuid, p_row_version bigint, p_detail jsonb, p_request_id text default null
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare current_detail app.engineer_private_details%rowtype; tenant uuid; result jsonb;
begin
  if auth.uid() is null or p_engineer_id is null or p_row_version is null or p_row_version < 0
     or p_detail is null or jsonb_typeof(p_detail) <> 'object'
     or not app.can_access_engineer(p_engineer_id, 'engineer.private.manage', 'edit') then
    raise exception 'engineer private detail is not manageable' using errcode = '42501';
  end if;
  tenant := app.current_tenant_id();
  select d.* into current_detail from app.engineer_private_details d
    where d.engineer_id = p_engineer_id and d.tenant_id = tenant for update;
  if found then
    if current_detail.row_version <> p_row_version then return null; end if;
    update app.engineer_private_details set
      birth_date = nullif(p_detail->>'birth_date','')::date,
      gender = nullif(p_detail->>'gender',''), personal_email = nullif(p_detail->>'personal_email','')::extensions.citext,
      phone = nullif(p_detail->>'phone',''), postal_code = nullif(p_detail->>'postal_code',''),
      prefecture = nullif(p_detail->>'prefecture',''), city = nullif(p_detail->>'city',''),
      address_line = nullif(p_detail->>'address_line',''), emergency_contact = nullif(p_detail->>'emergency_contact',''),
      notes = nullif(p_detail->>'notes',''), updated_by = auth.uid()
    where engineer_id = p_engineer_id;
  else
    if p_row_version <> 0 then return null; end if;
    insert into app.engineer_private_details(
      engineer_id, tenant_id, birth_date, gender, personal_email, phone, postal_code,
      prefecture, city, address_line, emergency_contact, notes, created_by, updated_by
    ) values (
      p_engineer_id, tenant, nullif(p_detail->>'birth_date','')::date, nullif(p_detail->>'gender',''),
      nullif(p_detail->>'personal_email','')::extensions.citext, nullif(p_detail->>'phone',''), nullif(p_detail->>'postal_code',''),
      nullif(p_detail->>'prefecture',''), nullif(p_detail->>'city',''), nullif(p_detail->>'address_line',''),
      nullif(p_detail->>'emergency_contact',''), nullif(p_detail->>'notes',''), auth.uid(), auth.uid()
    );
  end if;
  insert into audit.audit_logs(tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, metadata)
  values (tenant, auth.uid(), 'user', 'engineer.private_updated', 'engineer', p_engineer_id,
    nullif(p_request_id,''), jsonb_build_object('private_fields_changed', true));
  select jsonb_build_object(
    'engineer_id', d.engineer_id, 'birth_date', d.birth_date, 'gender', d.gender,
    'personal_email', d.personal_email, 'phone', d.phone, 'postal_code', d.postal_code,
    'prefecture', d.prefecture, 'city', d.city, 'address_line', d.address_line,
    'emergency_contact', d.emergency_contact, 'notes', d.notes,
    'updated_at', d.updated_at, 'row_version', d.row_version
  ) into result
  from app.engineer_private_details d
  where d.engineer_id = p_engineer_id and d.tenant_id = tenant;
  return result;
end
$$;

revoke all on function public.upsert_engineer_private_detail(uuid,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.upsert_engineer_private_detail(uuid,bigint,jsonb,text) to authenticated;
comment on function public.upsert_engineer_private_detail(uuid,bigint,jsonb,text) is
  'Creates or updates private engineer details with explicit permission, optimistic locking, and metadata-only audit.';

commit;
