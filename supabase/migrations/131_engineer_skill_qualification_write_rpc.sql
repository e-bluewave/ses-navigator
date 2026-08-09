-- SES Navigator
-- Migration: 131_engineer_skill_qualification_write_rpc
-- Purpose: Manage engineer skills and qualifications through authorized RPCs.

begin;

create table app.engineer_qualifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  engineer_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  issuer text,
  credential_id text,
  acquired_on date,
  expires_on date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  foreign key (tenant_id, engineer_id) references app.engineers(tenant_id, id) on delete cascade,
  check (expires_on is null or acquired_on is null or expires_on >= acquired_on)
);
create index engineer_qualifications_engineer_idx
  on app.engineer_qualifications(tenant_id, engineer_id, acquired_on desc);
select app.attach_updated_at_trigger('app.engineer_qualifications'::regclass);
select app.attach_row_version_trigger('app.engineer_qualifications'::regclass);
alter table app.engineer_qualifications enable row level security;
alter table app.engineer_qualifications force row level security;
create policy authenticated_select on app.engineer_qualifications for select to authenticated
  using (app.can_access_engineer(engineer_id, 'engineer.read', 'view'));
create policy authenticated_insert on app.engineer_qualifications for insert to authenticated
  with check (app.can_access_engineer(engineer_id, 'engineer.manage', 'edit'));
create policy authenticated_update on app.engineer_qualifications for update to authenticated
  using (app.can_access_engineer(engineer_id, 'engineer.manage', 'edit'))
  with check (app.can_access_engineer(engineer_id, 'engineer.manage', 'edit'));
revoke all on table app.engineer_qualifications from public, anon, authenticated;
grant select on table app.engineer_qualifications to authenticated;
grant all on table app.engineer_qualifications to service_role;

create or replace function public.save_engineer_skill(
  p_engineer_id uuid, p_engineer_skill_id uuid, p_row_version bigint,
  p_skill jsonb, p_request_id text default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare tenant uuid; target app.engineer_skills%rowtype; saved app.engineer_skills%rowtype;
begin
  if auth.uid() is null or p_engineer_id is null or p_row_version is null or p_row_version < 0
     or jsonb_typeof(p_skill) <> 'object'
     or not app.can_access_engineer(p_engineer_id, 'engineer.manage', 'edit') then
    raise exception 'engineer skill is not manageable' using errcode = '42501';
  end if;
  tenant := app.current_tenant_id();
  if not exists (select 1 from app.skills s where s.id=(p_skill->>'skill_id')::uuid
    and s.is_active and (s.tenant_id is null or s.tenant_id=tenant)) then
    raise exception 'invalid skill' using errcode = '22023';
  end if;
  if p_engineer_skill_id is null then
    if p_row_version <> 0 then return null; end if;
    insert into app.engineer_skills(tenant_id,engineer_id,skill_id,experience_months,
      proficiency_level,last_used_on,evidence_type,evidence_note,verification_status,is_primary,created_by,updated_by)
    values(tenant,p_engineer_id,(p_skill->>'skill_id')::uuid,nullif(p_skill->>'experience_months','')::integer,
      nullif(p_skill->>'proficiency_level','')::smallint,nullif(p_skill->>'last_used_on','')::date,
      nullif(p_skill->>'evidence_type',''),nullif(p_skill->>'evidence_note',''),
      coalesce(nullif(p_skill->>'verification_status',''),'unverified'),coalesce((p_skill->>'is_primary')::boolean,false),auth.uid(),auth.uid())
    returning * into saved;
  else
    select * into target from app.engineer_skills where id=p_engineer_skill_id and engineer_id=p_engineer_id and tenant_id=tenant for update;
    if not found or target.row_version <> p_row_version then return null; end if;
    update app.engineer_skills set skill_id=(p_skill->>'skill_id')::uuid,
      experience_months=nullif(p_skill->>'experience_months','')::integer,
      proficiency_level=nullif(p_skill->>'proficiency_level','')::smallint,
      last_used_on=nullif(p_skill->>'last_used_on','')::date,evidence_type=nullif(p_skill->>'evidence_type',''),
      evidence_note=nullif(p_skill->>'evidence_note',''),verification_status=coalesce(nullif(p_skill->>'verification_status',''),'unverified'),
      is_primary=coalesce((p_skill->>'is_primary')::boolean,false),updated_by=auth.uid()
    where id=target.id returning * into saved;
  end if;
  insert into audit.audit_logs(tenant_id,actor_user_id,actor_type,action,resource_type,resource_id,request_id,metadata)
  values(tenant,auth.uid(),'user','engineer.skill_saved','engineer',p_engineer_id,nullif(p_request_id,''),jsonb_build_object('engineer_skill_id',saved.id));
  return to_jsonb(saved)-array['tenant_id','created_by','updated_by','created_at'];
end $$;

create or replace function public.save_engineer_qualification(
  p_engineer_id uuid, p_qualification_id uuid, p_row_version bigint,
  p_qualification jsonb, p_request_id text default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare tenant uuid; target app.engineer_qualifications%rowtype; saved app.engineer_qualifications%rowtype;
begin
  if auth.uid() is null or p_engineer_id is null or p_row_version is null or p_row_version < 0
    or jsonb_typeof(p_qualification)<>'object' or nullif(btrim(p_qualification->>'name'),'') is null
    or not app.can_access_engineer(p_engineer_id,'engineer.manage','edit') then
    raise exception 'engineer qualification is not manageable' using errcode='42501';
  end if;
  tenant:=app.current_tenant_id();
  if p_qualification_id is null then
    if p_row_version<>0 then return null; end if;
    insert into app.engineer_qualifications(tenant_id,engineer_id,name,issuer,credential_id,acquired_on,expires_on,notes,created_by,updated_by)
    values(tenant,p_engineer_id,btrim(p_qualification->>'name'),nullif(p_qualification->>'issuer',''),nullif(p_qualification->>'credential_id',''),
      nullif(p_qualification->>'acquired_on','')::date,nullif(p_qualification->>'expires_on','')::date,nullif(p_qualification->>'notes',''),auth.uid(),auth.uid())
    returning * into saved;
  else
    select * into target from app.engineer_qualifications where id=p_qualification_id and engineer_id=p_engineer_id and tenant_id=tenant for update;
    if not found or target.row_version<>p_row_version then return null; end if;
    update app.engineer_qualifications set name=btrim(p_qualification->>'name'),issuer=nullif(p_qualification->>'issuer',''),
      credential_id=nullif(p_qualification->>'credential_id',''),acquired_on=nullif(p_qualification->>'acquired_on','')::date,
      expires_on=nullif(p_qualification->>'expires_on','')::date,notes=nullif(p_qualification->>'notes',''),updated_by=auth.uid()
    where id=target.id returning * into saved;
  end if;
  insert into audit.audit_logs(tenant_id,actor_user_id,actor_type,action,resource_type,resource_id,request_id,metadata)
  values(tenant,auth.uid(),'user','engineer.qualification_saved','engineer',p_engineer_id,nullif(p_request_id,''),jsonb_build_object('qualification_id',saved.id));
  return to_jsonb(saved)-array['tenant_id','created_by','updated_by','created_at'];
end $$;

revoke all on function public.save_engineer_skill(uuid,uuid,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_engineer_skill(uuid,uuid,bigint,jsonb,text) to authenticated;
revoke all on function public.save_engineer_qualification(uuid,uuid,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_engineer_qualification(uuid,uuid,bigint,jsonb,text) to authenticated;
commit;
