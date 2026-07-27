-- SES Navigator
-- Migration: 015_rls_helpers
-- Purpose: Provide tenant and administrator helper functions for Row Level Security policies.

begin;

create or replace function app.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select up.tenant_id
  from app.user_profiles up
  where up.user_id = auth.uid()
    and up.status = 'active'
  limit 1;
$$;

create or replace function app.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from app.system_admins sa
    where sa.user_id = auth.uid()
      and sa.is_active
      and sa.revoked_at is null
  );
$$;

create or replace function app.is_tenant_member(required_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.is_system_admin()
    or exists (
      select 1
      from app.tenant_memberships tm
      where tm.user_id = auth.uid()
        and tm.tenant_id = required_tenant_id
        and tm.membership_status = 'active'
        and (tm.joined_at is null or tm.joined_at <= now())
        and (tm.left_at is null or tm.left_at > now())
    );
$$;

create or replace function app.belongs_to_organization(required_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.is_system_admin()
    or exists (
      select 1
      from app.organization_memberships om
      where om.user_id = auth.uid()
        and om.organization_id = required_organization_id
        and om.membership_status = 'active'
        and om.valid_from <= current_date
        and (om.valid_to is null or om.valid_to >= current_date)
    );
$$;

revoke all on function app.current_tenant_id() from public;
revoke all on function app.is_system_admin() from public;
revoke all on function app.is_tenant_member(uuid) from public;
revoke all on function app.belongs_to_organization(uuid) from public;

grant execute on function app.current_tenant_id() to authenticated;
grant execute on function app.is_system_admin() to authenticated;
grant execute on function app.is_tenant_member(uuid) to authenticated;
grant execute on function app.belongs_to_organization(uuid) to authenticated;

commit;
