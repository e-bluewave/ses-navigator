-- SES Navigator
-- Migration: 019_company_contacts
-- Purpose: Define company-scoped contact persons used in sales and proposal workflows.

begin;

create table app.company_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  company_id uuid not null,
  management_no varchar(32) not null,
  family_name text not null,
  given_name text,
  family_name_kana text,
  given_name_kana text,
  full_name_normalized text not null,
  department_name text,
  position_title text,
  email citext,
  email_normalized citext,
  phone text,
  phone_normalized text,
  mobile_phone text,
  mobile_phone_normalized text,
  is_primary boolean not null default false,
  contact_status text not null default 'active'
    check (contact_status in ('active','inactive','left_company','unknown')),
  primary_owner_user_id uuid references auth.users(id) on delete set null,
  notes text,
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
  foreign key (tenant_id, company_id)
    references app.companies(tenant_id, id) on delete cascade,
  check (deleted_at is not null or deleted_by is null)
);

create index company_contacts_company_status_idx
  on app.company_contacts(tenant_id, company_id, contact_status)
  where deleted_at is null;
create index company_contacts_name_idx
  on app.company_contacts(tenant_id, full_name_normalized)
  where deleted_at is null;
create index company_contacts_email_idx
  on app.company_contacts(tenant_id, email_normalized)
  where email_normalized is not null and deleted_at is null;
create unique index company_contacts_one_primary_uidx
  on app.company_contacts(tenant_id, company_id)
  where is_primary and contact_status = 'active' and deleted_at is null;

select app.attach_updated_at_trigger('app.company_contacts'::regclass);

comment on table app.company_contacts is 'Company-specific contact persons for customer and business partner communications.';

commit;
