-- SES Navigator
-- Migration: 010_role_permissions
-- Purpose: Map tenant roles to application permissions.

begin;

create table app.role_permissions (
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  role_id uuid not null references app.roles(id) on delete cascade,
  permission_id uuid not null references app.permissions(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (role_id, permission_id)
);

create index role_permissions_tenant_id_idx on app.role_permissions(tenant_id);
create index role_permissions_permission_id_idx on app.role_permissions(permission_id);

create or replace function app.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from app.user_profiles up
    join app.user_roles ur
      on ur.user_id = up.user_id
     and ur.tenant_id = up.tenant_id
    join app.role_permissions rp
      on rp.role_id = ur.role_id
     and rp.tenant_id = up.tenant_id
    join app.permissions p on p.id = rp.permission_id
    where up.user_id = auth.uid()
      and up.status = 'active'
      and p.code = required_permission
  );
$$;

revoke all on function app.has_permission(text) from public;
grant execute on function app.has_permission(text) to authenticated;

commit;
