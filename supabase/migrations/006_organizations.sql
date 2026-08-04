-- SES Navigator
-- Migration: 006_organizations
-- Purpose: Define tenant organizations and hierarchy.

begin;

create table app.organizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  parent_id uuid,
  code citext not null,
  name text not null,
  organization_type text not null default 'department',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_tenant_id_id_key unique (tenant_id, id),
  unique (tenant_id, code),
  constraint organizations_parent_fk
    foreign key (tenant_id, parent_id)
    references app.organizations(tenant_id, id)
    on delete set null (parent_id)
);

create index organizations_tenant_id_idx on app.organizations(tenant_id);
create index organizations_parent_id_idx on app.organizations(parent_id);
select app.attach_updated_at_trigger('app.organizations'::regclass);

commit;
