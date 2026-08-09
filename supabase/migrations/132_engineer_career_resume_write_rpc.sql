-- SES Navigator
-- Migration: 132_engineer_career_resume_write_rpc
-- Purpose: Manage structured career histories and immutable resume versions through authorized RPCs.

begin;

create or replace function public.save_engineer_career_history(
  p_engineer_id uuid, p_career_history_id uuid, p_row_version bigint,
  p_history jsonb, p_request_id text default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare tenant uuid; target app.engineer_career_histories%rowtype; saved app.engineer_career_histories%rowtype;
begin
  if auth.uid() is null or p_engineer_id is null or p_row_version is null or p_row_version < 0
    or jsonb_typeof(p_history) <> 'object' or nullif(btrim(p_history->>'project_name'),'') is null
    or not app.can_access_engineer(p_engineer_id,'engineer.manage','edit') then
    raise exception 'engineer career history is not manageable' using errcode='42501';
  end if;
  if nullif(p_history->>'ended_on','')::date < nullif(p_history->>'started_on','')::date then
    raise exception 'career history period is invalid' using errcode='22023';
  end if;
  tenant := app.current_tenant_id();
  if p_career_history_id is null then
    if p_row_version <> 0 then return null; end if;
    insert into app.engineer_career_histories(tenant_id,engineer_id,project_name,client_name,role_name,industry,overview,responsibilities,achievements,team_size,started_on,ended_on,display_order,source_resume_version_id,created_by,updated_by)
    values(tenant,p_engineer_id,btrim(p_history->>'project_name'),nullif(p_history->>'client_name',''),nullif(p_history->>'role_name',''),nullif(p_history->>'industry',''),nullif(p_history->>'overview',''),nullif(p_history->>'responsibilities',''),nullif(p_history->>'achievements',''),nullif(p_history->>'team_size','')::integer,nullif(p_history->>'started_on','')::date,nullif(p_history->>'ended_on','')::date,coalesce((p_history->>'display_order')::integer,0),nullif(p_history->>'source_resume_version_id','')::uuid,auth.uid(),auth.uid()) returning * into saved;
  else
    select * into target from app.engineer_career_histories where id=p_career_history_id and engineer_id=p_engineer_id and tenant_id=tenant and deleted_at is null for update;
    if not found or target.row_version <> p_row_version then return null; end if;
    update app.engineer_career_histories set project_name=btrim(p_history->>'project_name'),client_name=nullif(p_history->>'client_name',''),role_name=nullif(p_history->>'role_name',''),industry=nullif(p_history->>'industry',''),overview=nullif(p_history->>'overview',''),responsibilities=nullif(p_history->>'responsibilities',''),achievements=nullif(p_history->>'achievements',''),team_size=nullif(p_history->>'team_size','')::integer,started_on=nullif(p_history->>'started_on','')::date,ended_on=nullif(p_history->>'ended_on','')::date,display_order=coalesce((p_history->>'display_order')::integer,0),source_resume_version_id=nullif(p_history->>'source_resume_version_id','')::uuid,updated_by=auth.uid() where id=target.id returning * into saved;
  end if;
  insert into audit.audit_logs(tenant_id,actor_user_id,actor_type,action,resource_type,resource_id,request_id,metadata)
  values(tenant,auth.uid(),'user','engineer.career_history_saved','engineer',p_engineer_id,nullif(p_request_id,''),jsonb_build_object('career_history_id',saved.id));
  return to_jsonb(saved)-array['tenant_id','created_by','updated_by','created_at','deleted_at','deleted_by','delete_reason'];
end $$;

create or replace function public.add_engineer_resume_version(
  p_engineer_id uuid, p_resume_id uuid, p_resume_row_version bigint,
  p_resume jsonb, p_version jsonb, p_request_id text default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare tenant uuid; container app.engineer_resumes%rowtype; version app.engineer_resume_versions%rowtype; next_no integer;
begin
  if auth.uid() is null or p_engineer_id is null or p_resume_row_version is null or p_resume_row_version < 0
    or jsonb_typeof(p_resume)<>'object' or jsonb_typeof(p_version)<>'object'
    or nullif(btrim(p_resume->>'title'),'') is null
    or not app.can_access_engineer(p_engineer_id,'engineer.manage','edit') then
    raise exception 'engineer resume is not manageable' using errcode='42501';
  end if;
  tenant:=app.current_tenant_id();
  if p_resume_id is null then
    if p_resume_row_version<>0 then return null; end if;
    insert into app.engineer_resumes(tenant_id,engineer_id,title,resume_status,created_by,updated_by)
    values(tenant,p_engineer_id,btrim(p_resume->>'title'),coalesce(nullif(p_resume->>'resume_status',''),'active'),auth.uid(),auth.uid()) returning * into container;
  else
    select * into container from app.engineer_resumes where id=p_resume_id and engineer_id=p_engineer_id and tenant_id=tenant and deleted_at is null for update;
    if not found or container.row_version<>p_resume_row_version then return null; end if;
    update app.engineer_resumes set title=btrim(p_resume->>'title'),resume_status=coalesce(nullif(p_resume->>'resume_status',''),'active'),updated_by=auth.uid() where id=container.id returning * into container;
  end if;
  select coalesce(max(version_no),0)+1 into next_no from app.engineer_resume_versions where resume_id=container.id;
  insert into app.engineer_resume_versions(tenant_id,resume_id,version_no,file_storage_path,original_file_name,mime_type,file_size_bytes,file_checksum,source_type,created_by)
  values(tenant,container.id,next_no,nullif(p_version->>'file_storage_path',''),nullif(p_version->>'original_file_name',''),nullif(p_version->>'mime_type',''),nullif(p_version->>'file_size_bytes','')::bigint,nullif(p_version->>'file_checksum',''),coalesce(nullif(p_version->>'source_type',''),'upload'),auth.uid()) returning * into version;
  update app.engineer_resumes set current_version_id=version.id,updated_by=auth.uid() where id=container.id returning * into container;
  insert into audit.audit_logs(tenant_id,actor_user_id,actor_type,action,resource_type,resource_id,request_id,metadata)
  values(tenant,auth.uid(),'user','engineer.resume_version_added','engineer',p_engineer_id,nullif(p_request_id,''),jsonb_build_object('resume_id',container.id,'resume_version_id',version.id,'version_no',version.version_no));
  return jsonb_build_object('id',container.id,'engineer_id',container.engineer_id,'title',container.title,'resume_status',container.resume_status,'current_version_id',container.current_version_id,'updated_at',container.updated_at,'row_version',container.row_version,'version',to_jsonb(version)-array['tenant_id','created_by','extracted_text','structured_data']);
end $$;

revoke all on function public.save_engineer_career_history(uuid,uuid,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_engineer_career_history(uuid,uuid,bigint,jsonb,text) to authenticated;
revoke all on function public.add_engineer_resume_version(uuid,uuid,bigint,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.add_engineer_resume_version(uuid,uuid,bigint,jsonb,jsonb,text) to authenticated;

commit;
