-- SES Navigator
-- Migration: 057_proposal_status_histories
-- Purpose: Record every proposal status transition and correction.

begin;

create table app.proposal_status_histories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  proposal_id uuid not null,
  from_status text,
  to_status text not null,
  change_reason text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  source_type text not null default 'user'
    check (source_type in ('user','system','ai_suggestion','migration','correction')),
  corrected_history_id uuid references app.proposal_status_histories(id) on delete set null,
  is_kpi_excluded boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  foreign key (tenant_id, proposal_id) references app.proposals(tenant_id, id) on delete cascade,
  check (from_status is distinct from to_status)
);

create index proposal_status_histories_proposal_idx
  on app.proposal_status_histories(tenant_id, proposal_id, changed_at desc);
create index proposal_status_histories_kpi_idx
  on app.proposal_status_histories(tenant_id, to_status, changed_at)
  where not is_kpi_excluded;

commit;
