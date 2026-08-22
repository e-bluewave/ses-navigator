-- SES Navigator
-- Migration: 158_data_api_auth_helper_rpcs
-- Purpose: Publish the three authentication helpers used by the API without
--          exposing the internal app schema through PostgREST.

begin;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select app.current_tenant_id();
$$;

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select app.is_system_admin();
$$;

create or replace function public.has_permission(required_permission text)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select app.has_permission(required_permission);
$$;

revoke all on function public.current_tenant_id()
  from public, anon, authenticated, service_role;
revoke all on function public.is_system_admin()
  from public, anon, authenticated, service_role;
revoke all on function public.has_permission(text)
  from public, anon, authenticated, service_role;

grant execute on function public.current_tenant_id() to authenticated;
grant execute on function public.is_system_admin() to authenticated;
grant execute on function public.has_permission(text) to authenticated;

comment on function public.current_tenant_id() is
  'Returns the authenticated user default tenant through the internal authorization helper.';
comment on function public.is_system_admin() is
  'Returns whether the authenticated user is an active system administrator.';
comment on function public.has_permission(text) is
  'Returns whether the authenticated user has the requested permission in the default tenant.';

commit;
