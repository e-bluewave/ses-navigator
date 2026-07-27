-- SES Navigator
-- Migration: 053_project_merge_histories
-- Purpose: Preserve immutable details of completed project merges.

begin;

create table app.project_merge_histories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  merge_job_id uuid not null references app.project_merge_jobs(id) on delete cascade,
  surviving_project_id uuid not null,
  merged_project_id uuid not null,
  merged_snapshot jsonb not null,
  reassigned_counts jsonb not null default '{}'::jsonb,
  executed_by uuid references auth.users(id) on delete set null,
  executed_at timestamptz not null default now(),
  notes text,
  foreign key (tenant_id, surviving_project_id) references app.projects(tenant_id, id) on delete restrict,
  foreign key (tenant_id, merged_project_id) references app.projects(tenant_id, id) on delete restrict
);

create index project_merge_histories_survivor_idx
  on app.project_merge_histories(tenant_id, surviving_project_id, executed_at desc);

commit;
