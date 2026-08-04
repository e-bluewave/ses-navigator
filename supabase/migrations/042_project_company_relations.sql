-- SES Navigator
-- Migration: 042_project_company_relations
-- Purpose: Model project commercial-chain companies and ordering.

begin;

create table app.project_company_relations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  project_id uuid not null,
  company_id uuid not null,
  relation_type text not null
    check (relation_type in ('end_customer','customer','prime_contractor','upper_partner','source_partner','billing_party','other')),
  commercial_order integer check (commercial_order is null or commercial_order > 0),
  is_confirmed boolean not null default false,
  valid_from date,
  valid_to date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  unique (project_id, company_id, relation_type),
  foreign key (tenant_id, project_id) references app.projects(tenant_id, id) on delete cascade,
  foreign key (tenant_id, company_id) references app.companies(tenant_id, id) on delete restrict,
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create index project_company_relations_project_idx
  on app.project_company_relations(tenant_id, project_id, commercial_order);

select app.attach_updated_at_trigger('app.project_company_relations'::regclass);

commit;
