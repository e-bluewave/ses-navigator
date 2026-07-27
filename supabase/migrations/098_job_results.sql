-- SES Navigator
-- Migration: 098_job_results
-- Purpose: Persist structured and textual outputs produced by asynchronous jobs.

begin;

create table app.job_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  job_id uuid not null,
  result_type text not null default 'default',
  result_data jsonb not null default '{}'::jsonb,
  result_text text,
  storage_path text,
  checksum text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (tenant_id, job_id, result_type),
  foreign key (tenant_id, job_id) references app.jobs(tenant_id, id) on delete cascade,
  check (expires_at is null or expires_at > created_at)
);

create index job_results_job_idx on app.job_results(tenant_id, job_id, created_at desc);

commit;
