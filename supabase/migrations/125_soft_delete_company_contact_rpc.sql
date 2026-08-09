-- SES Navigator
-- Migration: 125_soft_delete_company_contact_rpc
-- Purpose: Atomically soft-delete an authorized company contact and append its audit event.

begin;

create or replace function public.soft_delete_company_contact(
  p_contact_id uuid,
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
  target app.company_contacts%rowtype;
begin
  if auth.uid() is null
     or p_contact_id is null
     or p_row_version is null
     or p_row_version < 1
     or p_delete_reason is null
     or length(btrim(p_delete_reason)) not between 1 and 500
  then
    raise exception 'invalid company contact deletion request' using errcode = '22023';
  end if;

  select c.* into target
  from app.company_contacts c
  where c.id = p_contact_id
    and c.deleted_at is null
    and app.can_access_company(c.company_id, 'company.manage', 'edit')
  for update;

  if not found or target.row_version <> p_row_version then
    return false;
  end if;

  update app.company_contacts
  set deleted_at = statement_timestamp(),
      deleted_by = auth.uid(),
      delete_reason = btrim(p_delete_reason),
      updated_by = auth.uid()
  where id = target.id;

  insert into audit.audit_logs (
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    target.tenant_id, auth.uid(), 'user', 'company_contact.soft_deleted',
    'company_contact', target.id, nullif(p_request_id, ''),
    jsonb_build_object(
      'company_id', target.company_id,
      'management_no', target.management_no,
      'family_name', target.family_name,
      'given_name', target.given_name,
      'contact_status', target.contact_status,
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

revoke all on function public.soft_delete_company_contact(uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.soft_delete_company_contact(uuid, bigint, text, text)
  to authenticated;

comment on function public.soft_delete_company_contact(uuid, bigint, text, text) is
  'Soft-deletes one RLS-authorized company contact with optimistic locking and appends an audit event atomically.';

commit;
