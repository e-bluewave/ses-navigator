-- SES Navigator
-- Migration: 020_company_contact_histories
-- Purpose: Preserve company contact organization and communication detail changes over time.

begin;

create table app.company_contact_histories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  company_contact_id uuid not null,
  department_name text,
  position_title text,
  email citext,
  phone text,
  mobile_phone text,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  change_reason text,
  source text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  foreign key (tenant_id, company_contact_id)
    references app.company_contacts(tenant_id, id) on delete cascade,
  check (valid_to is null or valid_to >= valid_from)
);

create index company_contact_histories_contact_idx
  on app.company_contact_histories(tenant_id, company_contact_id, valid_from desc);
create unique index company_contact_histories_current_uidx
  on app.company_contact_histories(tenant_id, company_contact_id)
  where valid_to is null;

comment on table app.company_contact_histories is 'Historical department, position, and communication details for company contacts.';

commit;
