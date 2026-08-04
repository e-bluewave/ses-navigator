-- SES Navigator
-- Migration: 018_company_risk_records
-- Purpose: Record company risk assessments with visibility and validity periods.

begin;

create table app.company_risk_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  company_id uuid not null,
  risk_type text not null
    check (risk_type in ('credit','compliance','contract','payment','reputation','security','other')),
  severity text not null
    check (severity in ('low','medium','high','critical')),
  visibility_scope text not null default 'restricted'
    check (visibility_scope in ('restricted','management','all_internal')),
  title text not null,
  details text,
  source text,
  valid_from date not null default current_date,
  valid_to date,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  foreign key (tenant_id, company_id)
    references app.companies(tenant_id, id) on delete cascade,
  check (valid_to is null or valid_to >= valid_from),
  check (resolved_at is null or resolution_notes is not null)
);

create index company_risk_records_company_idx
  on app.company_risk_records(tenant_id, company_id);
create index company_risk_records_open_severity_idx
  on app.company_risk_records(tenant_id, severity)
  where resolved_at is null;

select app.attach_updated_at_trigger('app.company_risk_records'::regclass);

comment on table app.company_risk_records is 'Company risk assessments with controlled visibility and resolution history.';

commit;
