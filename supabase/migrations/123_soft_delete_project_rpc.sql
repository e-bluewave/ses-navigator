-- SES Navigator
-- Migration: 123_soft_delete_project_rpc
-- Purpose: Atomically soft-delete an authorized project and append its audit event.

begin;

create or replace function public.soft_delete_project(
  p_project_id uuid,
  p_row_version bigint,
  p_delete_reason text,
  p_request_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target app.projects%rowtype;
begin
  if auth.uid() is null
     or p_project_id is null
     or p_row_version is null
     or p_row_version < 1
     or p_delete_reason is null
     or length(btrim(p_delete_reason)) not between 1 and 500
  then
    raise exception 'invalid project deletion request'
      using errcode = '22023';
  end if;

  select p.*
    into target
  from app.projects p
  where p.id = p_project_id
    and p.deleted_at is null
    and app.can_access_project(p.id, 'project.manage', 'edit')
  for update;

  if not found or target.row_version <> p_row_version then
    return false;
  end if;

  update app.projects
  set deleted_at = statement_timestamp(),
      deleted_by = auth.uid(),
      delete_reason = btrim(p_delete_reason),
      updated_by = auth.uid()
  where id = target.id;

  insert into audit.audit_logs (
    tenant_id,
    actor_user_id,
    actor_type,
    action,
    resource_type,
    resource_id,
    request_id,
    before_data,
    after_data,
    metadata
  ) values (
    target.tenant_id,
    auth.uid(),
    'user',
    'project.soft_deleted',
    'project',
    target.id,
    nullif(p_request_id, ''),
    jsonb_build_object(
      'management_no', target.management_no,
      'project_name', target.project_name,
      'project_status', target.project_status,
      'recruitment_status', target.recruitment_status,
      'row_version', target.row_version
    ),
    jsonb_build_object(
      'deleted_at', statement_timestamp(),
      'deleted_by', auth.uid(),
      'delete_reason', btrim(p_delete_reason),
      'row_version', target.row_version + 1
    ),
    jsonb_build_object('delete_reason', btrim(p_delete_reason))
  );

  return true;
end
$$;

revoke all on function public.soft_delete_project(uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.soft_delete_project(uuid, bigint, text, text)
  to authenticated;

comment on function public.soft_delete_project(uuid, bigint, text, text) is
  'Soft-deletes one RLS-authorized project with optimistic locking and appends an audit event atomically.';

commit;
