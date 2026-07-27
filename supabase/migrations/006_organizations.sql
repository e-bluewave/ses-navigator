-- SES Navigator
-- Migration: 006_organizations
-- Purpose: Define tenant organizations and hierarchy.

begin;

create table app.organizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  parent_id uuid references app.organizations(id) on delete set null,
  code citext not null,
  name text not null,
  organization_type text not null default 'department',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index organizations_tenant_id_idx on app.organizations(tenant_id);
create index organizations_parent_id_idx on app.organizations(parent_id);
select app.attach_updated_at_trigger('app.organizations'::regclass);

commit;
