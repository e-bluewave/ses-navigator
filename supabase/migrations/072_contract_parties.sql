-- SES Navigator
-- Migration: 072_contract_parties
-- Purpose: Store companies and contacts participating in a contract.

begin;

create table app.contract_parties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  contract_id uuid not null,
  company_id uuid not null,
  contact_id uuid,
  party_role text not null check (party_role in ('customer','supplier','employer','end_client','prime_contractor','subcontractor','other')),
  billing_role text check (billing_role in ('bill_to','pay_to','none')),
  is_primary boolean not null default false,
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
  unique (tenant_id, contract_id, company_id, party_role),
  foreign key (tenant_id, contract_id) references app.contracts(tenant_id, id) on delete cascade,
  foreign key (tenant_id, company_id) references app.companies(tenant_id, id) on delete restrict,
  foreign key (tenant_id, contact_id) references app.company_contacts(tenant_id, id) on delete set null
);

create index contract_parties_contract_idx on app.contract_parties(tenant_id, contract_id) where deleted_at is null;
create index contract_parties_company_idx on app.contract_parties(tenant_id, company_id) where deleted_at is null;

select app.attach_updated_at_trigger('app.contract_parties'::regclass);

commit;