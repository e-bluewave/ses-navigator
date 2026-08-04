-- SES Navigator
-- Migration: 056_proposal_snapshots
-- Purpose: Preserve proposal data at creation, approval, and send milestones.

begin;

create table app.proposal_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  proposal_id uuid not null,
  snapshot_type text not null
    check (snapshot_type in ('created','submitted','approved','sent','corrected','manual')),
  snapshot_data jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  foreign key (tenant_id, proposal_id) references app.proposals(tenant_id, id) on delete cascade
);

create index proposal_snapshots_proposal_idx
  on app.proposal_snapshots(tenant_id, proposal_id, created_at desc);

commit;
