-- SES Navigator
-- Migration: 096_job_attempts
-- Purpose: Record each execution attempt for an asynchronous job.

begin;

create table app.job_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  job_id uuid not null,
  attempt_no integer not null check (attempt_no > 0),
  status text not null check (status in ('running','succeeded','failed','timed_out','cancelled')),
  worker_id text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  unique (tenant_id, job_id, attempt_no),
  foreign key (tenant_id, job_id) references app.jobs(tenant_id, id) on delete cascade,
  check (finished_at is null or finished_at >= started_at)
);

create index job_attempts_job_idx on app.job_attempts(tenant_id, job_id, attempt_no desc);

commit;
