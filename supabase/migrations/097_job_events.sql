-- SES Navigator
-- Migration: 097_job_events
-- Purpose: Store append-only lifecycle events emitted by asynchronous jobs.

begin;

create table app.job_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  job_id uuid not null,
  attempt_id uuid,
  event_type text not null,
  event_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  foreign key (tenant_id, job_id) references app.jobs(tenant_id, id) on delete cascade,
  foreign key (attempt_id) references app.job_attempts(id) on delete set null
);

create index job_events_job_idx on app.job_events(tenant_id, job_id, event_at);
create index job_events_type_idx on app.job_events(tenant_id, event_type, event_at desc);

commit;
