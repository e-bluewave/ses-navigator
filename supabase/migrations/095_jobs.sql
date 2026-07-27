-- SES Navigator
-- Migration: 095_jobs
-- Purpose: Define asynchronous jobs with lease-based execution control.

begin;

create table app.jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled','dead_letter')),
  priority smallint not null default 100,
  payload jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  deduplication_key text,
  last_error text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, job_type, deduplication_key),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create index jobs_dequeue_idx on app.jobs(status, scheduled_at, priority, created_at) where status = 'queued';
create index jobs_tenant_status_idx on app.jobs(tenant_id, status, created_at desc);
select app.attach_updated_at_trigger('app.jobs'::regclass);

commit;
