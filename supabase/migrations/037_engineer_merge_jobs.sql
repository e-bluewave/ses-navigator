-- SES Navigator
-- Migration: 037_engineer_merge_jobs
-- Purpose: Track controlled engineer merge execution.

begin;

create table app.engineer_merge_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  duplicate_candidate_id uuid,
  source_engineer_id uuid not null,
  target_engineer_id uuid not null,
  merge_status text not null default 'draft'
    check (merge_status in ('draft','approved','processing','completed','failed','cancelled')),
  merge_plan jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  foreign key (tenant_id, duplicate_candidate_id)
    references app.engineer_duplicate_candidates(tenant_id, id) on delete set null,
  foreign key (tenant_id, source_engineer_id)
    references app.engineers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, target_engineer_id)
    references app.engineers(tenant_id, id) on delete restrict,
  check (source_engineer_id <> target_engineer_id),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create index engineer_merge_jobs_status_idx
  on app.engineer_merge_jobs(tenant_id, merge_status, created_at desc);

commit;
