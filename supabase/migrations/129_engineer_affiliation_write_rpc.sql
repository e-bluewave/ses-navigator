-- SES Navigator
-- Migration: 129_engineer_affiliation_write_rpc
-- Purpose: Create or update engineer affiliation history through an authorized RPC.

begin;

create or replace function public.save_engineer_affiliation(
  p_engineer_id uuid,
  p_affiliation_id uuid,
  p_row_version bigint,
  p_affiliation jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid;
  target app.engineer_affiliations%rowtype;
  saved app.engineer_affiliations%rowtype;
  company uuid;
  start_on date;
  end_on date;
  primary_flag boolean;
begin
  if auth.uid() is null or p_engineer_id is null or p_row_version is null
     or p_row_version < 0 or p_affiliation is null
     or jsonb_typeof(p_affiliation) <> 'object'
     or not app.can_access_engineer(p_engineer_id, 'engineer.manage', 'edit') then
    raise exception 'engineer affiliation is not manageable' using errcode = '42501';
  end if;
  tenant := app.current_tenant_id();
  company := nullif(p_affiliation->>'company_id', '')::uuid;
  start_on := nullif(p_affiliation->>'start_date', '')::date;
  end_on := nullif(p_affiliation->>'end_date', '')::date;
  primary_flag := coalesce((p_affiliation->>'is_primary')::boolean, false);
  if company is null or start_on is null or (end_on is not null and end_on < start_on)
     or coalesce(p_affiliation->>'affiliation_type', '') not in
       ('employee','freelance','partner_employee','subcontractor','other') then
    raise exception 'invalid engineer affiliation' using errcode = '22023';
  end if;
  if not exists (select 1 from app.companies c where c.id = company and c.tenant_id = tenant and c.deleted_at is null) then
    raise exception 'affiliation company is unavailable' using errcode = '22023';
  end if;

  if p_affiliation_id is null then
    if p_row_version <> 0 then return null; end if;
    insert into app.engineer_affiliations(
      tenant_id, engineer_id, company_id, affiliation_type, contract_type,
      start_date, end_date, is_primary, notes, created_by, updated_by
    ) values (
      tenant, p_engineer_id, company, p_affiliation->>'affiliation_type',
      nullif(p_affiliation->>'contract_type',''), start_on, end_on, primary_flag,
      nullif(p_affiliation->>'notes',''), auth.uid(), auth.uid()
    ) returning * into saved;
  else
    select a.* into target from app.engineer_affiliations a
      where a.id = p_affiliation_id and a.engineer_id = p_engineer_id
        and a.tenant_id = tenant for update;
    if not found or target.row_version <> p_row_version then return null; end if;
    update app.engineer_affiliations set
      company_id = company, affiliation_type = p_affiliation->>'affiliation_type',
      contract_type = nullif(p_affiliation->>'contract_type',''),
      start_date = start_on, end_date = end_on, is_primary = primary_flag,
      notes = nullif(p_affiliation->>'notes',''), updated_by = auth.uid()
    where id = target.id returning * into saved;
  end if;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, metadata
  ) values (
    tenant, auth.uid(), 'user', 'engineer.affiliation_saved', 'engineer',
    p_engineer_id, nullif(p_request_id,''),
    jsonb_build_object('affiliation_id', saved.id, 'is_new', p_affiliation_id is null)
  );
  return jsonb_build_object(
    'id', saved.id, 'engineer_id', saved.engineer_id, 'company_id', saved.company_id,
    'affiliation_type', saved.affiliation_type, 'contract_type', saved.contract_type,
    'start_date', saved.start_date, 'end_date', saved.end_date,
    'is_primary', saved.is_primary, 'notes', saved.notes,
    'updated_at', saved.updated_at, 'row_version', saved.row_version
  );
end
$$;

revoke all on function public.save_engineer_affiliation(uuid,uuid,bigint,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.save_engineer_affiliation(uuid,uuid,bigint,jsonb,text)
  to authenticated;

commit;
