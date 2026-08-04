-- SES Navigator
-- Migration: 052_project_merge_jobs
-- Purpose: Manage reviewed project merge operations.

begin;

create table app.project_merge_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  surviving_project_id uuid not null,
  merged_project_id uuid not null,
  status text not null default 'draft'
    check (status in ('draft','approved','running','completed','failed','cancelled')),
  merge_plan jsonb not null default '{}'::jsonb,
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (surviving_project_id <> merged_project_id),
  foreign key (tenant_id, surviving_project_id) references app.projects(tenant_id, id) on delete restrict,
  foreign key (tenant_id, merged_project_id) references app.projects(tenant_id, id) on delete restrict
);

create index project_merge_jobs_status_idx on app.project_merge_jobs(tenant_id, status, created_at);
select app.attach_updated_at_trigger('app.project_merge_jobs'::regclass);

commit;
