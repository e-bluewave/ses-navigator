-- SES Navigator
-- Migration: 036_engineer_duplicate_candidates
-- Purpose: Store engineer duplicate detection candidates and review decisions.

begin;

create table app.engineer_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  engineer_id_a uuid not null,
  engineer_id_b uuid not null,
  duplicate_score numeric(5,4) not null,
  match_reasons jsonb not null default '[]'::jsonb,
  decision_status text not null default 'pending'
    check (decision_status in ('pending','duplicate','not_duplicate','merged','dismissed')),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decision_notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  foreign key (tenant_id, engineer_id_a) references app.engineers(tenant_id, id) on delete cascade,
  foreign key (tenant_id, engineer_id_b) references app.engineers(tenant_id, id) on delete cascade,
  check (engineer_id_a <> engineer_id_b),
  check (engineer_id_a < engineer_id_b),
  check (duplicate_score between 0 and 1),
  unique (tenant_id, engineer_id_a, engineer_id_b)
);

create index engineer_duplicate_candidates_status_idx
  on app.engineer_duplicate_candidates(tenant_id, decision_status, duplicate_score desc);

commit;
