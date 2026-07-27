-- SES Navigator
-- Migration: 073_contract_versions
-- Purpose: Preserve immutable contract revisions and source documents.

begin;

create table app.contract_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  contract_id uuid not null,
  version_no integer not null,
  effective_from date not null,
  effective_to date,
  contract_data jsonb not null default '{}'::jsonb,
  document_path text,
  document_name text,
  document_hash text,
  change_summary text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  unique (tenant_id, contract_id, version_no),
  foreign key (tenant_id, contract_id) references app.contracts(tenant_id, id) on delete cascade,
  check (version_no > 0),
  check (effective_to is null or effective_to >= effective_from)
);

create index contract_versions_contract_idx on app.contract_versions(tenant_id, contract_id, version_no desc);

comment on table app.contract_versions is 'Immutable snapshots of contract terms and attached source documents.';

commit;