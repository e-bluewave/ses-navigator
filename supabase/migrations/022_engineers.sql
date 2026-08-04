-- SES Navigator
-- Migration: 022_engineers
-- Purpose: Define public engineer master records.

begin;

create table app.engineers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  management_no varchar(32) not null,
  family_name text not null,
  given_name text not null,
  family_name_kana text,
  given_name_kana text,
  display_name text,
  name_normalized text not null,
  status text not null default 'active'
    check (status in ('candidate','active','inactive','retired','blocked')),
  availability_status text not null default 'unknown'
    check (availability_status in ('unknown','available','proposed','engaged','unavailable')),
  available_from date,
  nearest_station text,
  summary text,
  primary_owner_user_id uuid references auth.users(id) on delete set null,
  owner_organization_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id),
  unique (tenant_id, management_no),
  foreign key (tenant_id, owner_organization_id)
    references app.organizations(tenant_id, id)
    on delete set null (owner_organization_id),
  check (deleted_at is not null or deleted_by is null)
);

create index engineers_tenant_status_idx
  on app.engineers(tenant_id, status, availability_status)
  where deleted_at is null;
create index engineers_tenant_name_idx
  on app.engineers(tenant_id, name_normalized)
  where deleted_at is null;
create index engineers_available_from_idx
  on app.engineers(tenant_id, available_from)
  where deleted_at is null and availability_status = 'available';
create index engineers_owner_organization_idx
  on app.engineers(tenant_id, owner_organization_id)
  where deleted_at is null and owner_organization_id is not null;

select app.attach_updated_at_trigger('app.engineers'::regclass);

commit;
