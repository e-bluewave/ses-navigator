-- SES Navigator
-- Migration: 008_roles
-- Purpose: Define tenant-scoped roles and time-bounded user assignments.

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
  unique (tenant_id, id),
  unique (tenant_id, code)
);

create table app.user_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  user_id uuid not null references app.user_profiles(user_id) on delete cascade,
  role_id uuid not null,
  organization_id uuid,
  valid_from date not null default current_date,
  valid_to date,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_reason text,
  unique nulls not distinct (tenant_id, user_id, role_id, organization_id, valid_from),
  foreign key (tenant_id, role_id)
    references app.roles(tenant_id, id) on delete cascade,
  foreign key (tenant_id, organization_id)
    references app.organizations(tenant_id, id) on delete restrict,
  check (valid_to is null or valid_to >= valid_from),
  check (revoked_at is null or revoked_at >= granted_at)
);

create index roles_tenant_id_idx on app.roles(tenant_id);
create index user_roles_tenant_id_idx on app.user_roles(tenant_id);
create index user_roles_active_user_idx
  on app.user_roles(tenant_id, user_id, role_id)
  where revoked_at is null;
create index user_roles_active_organization_idx
  on app.user_roles(tenant_id, organization_id, role_id)
  where organization_id is not null and revoked_at is null;
select app.attach_updated_at_trigger('app.roles'::regclass);

commit;
