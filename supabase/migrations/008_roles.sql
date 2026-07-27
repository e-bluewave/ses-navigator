-- SES Navigator
-- Migration: 008_roles
-- Purpose: Define tenant-scoped roles and user assignments.

begin;

create table app.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  code citext not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table app.user_roles (
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  user_id uuid not null references app.user_profiles(user_id) on delete cascade,
  role_id uuid not null references app.roles(id) on delete cascade,
  organization_id uuid references app.organizations(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (user_id, role_id, organization_id)
);

create index roles_tenant_id_idx on app.roles(tenant_id);
create index user_roles_tenant_id_idx on app.user_roles(tenant_id);
select app.attach_updated_at_trigger('app.roles'::regclass);

commit;
