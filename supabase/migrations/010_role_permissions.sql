-- SES Navigator
-- Migration: 010_role_permissions
-- Purpose: Map tenant roles to application permissions.

begin;

create table app.role_permissions (
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  role_id uuid not null,
  permission_id uuid not null references app.permissions(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (tenant_id, role_id, permission_id),
  foreign key (tenant_id, role_id)
    references app.roles(tenant_id, id) on delete cascade
);

create index role_permissions_tenant_id_idx on app.role_permissions(tenant_id);
create index role_permissions_permission_id_idx on app.role_permissions(permission_id);

commit;
