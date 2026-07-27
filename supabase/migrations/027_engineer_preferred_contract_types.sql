-- SES Navigator
-- Migration: 027_engineer_preferred_contract_types
-- Purpose: Store searchable preferred contract types for engineers.

begin;

create table app.engineer_preferred_contract_types (
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  engineer_id uuid not null,
  contract_type text not null
    check (contract_type in ('employee','dispatch','quasi委任','contract','freelance','other')),
  priority smallint not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (tenant_id, engineer_id, contract_type),
  foreign key (tenant_id, engineer_id) references app.engineers(tenant_id, id) on delete cascade,
  check (priority between 1 and 99)
);

create index engineer_preferred_contract_types_engineer_idx
  on app.engineer_preferred_contract_types(tenant_id, engineer_id, priority);
create index engineer_preferred_contract_types_search_idx
  on app.engineer_preferred_contract_types(tenant_id, contract_type);

commit;
