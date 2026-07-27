-- SES Navigator
-- Migration: 071_contracts
-- Purpose: Define contracts created from successful proposals and assignments.

begin;

create table app.contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  contract_no varchar(32) not null,
  project_id uuid,
  proposal_id uuid,
  engineer_id uuid,
  contract_type text not null check (contract_type in ('ses','dispatch','subcontract','quasi_mandate','fixed_price','other')),
  status text not null default 'draft' check (status in ('draft','review','active','suspended','expired','terminated','cancelled')),
  title text not null,
  start_date date not null,
  end_date date,
  auto_renew boolean not null default false,
  currency char(3) not null default 'JPY',
  monthly_amount numeric(14,2),
  hourly_amount numeric(14,2),
  settlement_lower_hours numeric(8,2),
  settlement_upper_hours numeric(8,2),
  payment_terms text,
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
  unique (tenant_id, contract_no),
  foreign key (tenant_id, project_id) references app.projects(tenant_id, id) on delete set null,
  foreign key (tenant_id, proposal_id) references app.proposals(tenant_id, id) on delete set null,
  foreign key (tenant_id, engineer_id) references app.engineers(tenant_id, id) on delete set null,
  check (end_date is null or end_date >= start_date),
  check (monthly_amount is null or monthly_amount >= 0),
  check (hourly_amount is null or hourly_amount >= 0),
  check (settlement_upper_hours is null or settlement_lower_hours is null or settlement_upper_hours >= settlement_lower_hours)
);

create index contracts_tenant_status_idx on app.contracts(tenant_id, status) where deleted_at is null;
create index contracts_project_idx on app.contracts(tenant_id, project_id) where deleted_at is null;
create index contracts_engineer_idx on app.contracts(tenant_id, engineer_id) where deleted_at is null;

select app.attach_updated_at_trigger('app.contracts'::regclass);

commit;