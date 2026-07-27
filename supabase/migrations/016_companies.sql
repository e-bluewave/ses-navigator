-- SES Navigator
-- Migration: 016_companies
-- Purpose: Define tenant-scoped company master records.

begin;

create table app.companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  management_no varchar(32) not null,
  legal_name text not null,
  legal_name_normalized text not null,
  display_name text,
  corporate_number varchar(13),
  postal_code varchar(8),
  prefecture text,
  city text,
  address_line text,
  website_url text,
  representative_name text,
  status text not null default 'active'
    check (status in ('prospect','active','inactive','blocked')),
  risk_level text not null default 'none'
    check (risk_level in ('none','low','medium','high','critical')),
  risk_summary text,
  primary_owner_user_id uuid references auth.users(id) on delete set null,
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
  check (corporate_number is null or corporate_number ~ '^[0-9]{13}$'),
  check (deleted_at is not null or deleted_by is null)
);

create index companies_tenant_status_idx
  on app.companies(tenant_id, status)
  where deleted_at is null;
create index companies_tenant_name_idx
  on app.companies(tenant_id, legal_name_normalized)
  where deleted_at is null;
create unique index companies_tenant_corporate_number_uidx
  on app.companies(tenant_id, corporate_number)
  where corporate_number is not null;

select app.attach_updated_at_trigger('app.companies'::regclass);

comment on table app.companies is 'Tenant-scoped company master shared by customers, partners, employers, and commercial parties.';

commit;
