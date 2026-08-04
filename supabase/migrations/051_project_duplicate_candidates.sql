-- SES Navigator
-- Migration: 051_project_duplicate_candidates
-- Purpose: Store possible duplicate project pairs and review outcomes.

begin;

create table app.project_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  source_project_id uuid not null,
  candidate_project_id uuid not null,
  match_score numeric(5,4) not null check (match_score between 0 and 1),
  match_reasons jsonb not null default '[]'::jsonb,
  decision text not null default 'pending'
    check (decision in ('pending','duplicate','not_duplicate','merged','ignored')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  unique (tenant_id, source_project_id, candidate_project_id),
  check (source_project_id <> candidate_project_id),
  foreign key (tenant_id, source_project_id) references app.projects(tenant_id, id) on delete cascade,
  foreign key (tenant_id, candidate_project_id) references app.projects(tenant_id, id) on delete cascade
);

create index project_duplicate_candidates_pending_idx
  on app.project_duplicate_candidates(tenant_id, match_score desc)
  where decision = 'pending';

commit;
