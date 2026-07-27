-- SES Navigator
-- Migration: 024_engineer_affiliations
-- Purpose: Track engineer company affiliations and contract relationships over time.

begin;

create table app.engineer_affiliations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  engineer_id uuid not null,
  company_id uuid not null,
  affiliation_type text not null
    check (affiliation_type in ('employee','freelance','partner_employee','subcontractor','other')),
  contract_type text,
  start_date date,
  end_date date,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  foreign key (tenant_id, engineer_id) references app.engineers(tenant_id, id) on delete cascade,
  foreign key (tenant_id, company_id) references app.companies(tenant_id, id) on delete restrict,
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index engineer_affiliations_engineer_idx
  on app.engineer_affiliations(tenant_id, engineer_id, start_date desc);
create index engineer_affiliations_company_idx
  on app.engineer_affiliations(tenant_id, company_id);
create unique index engineer_affiliations_primary_active_uidx
  on app.engineer_affiliations(tenant_id, engineer_id)
  where is_primary and end_date is null;

select app.attach_updated_at_trigger('app.engineer_affiliations'::regclass);

commit;
