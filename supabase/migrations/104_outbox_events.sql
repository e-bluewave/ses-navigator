-- SES Navigator
-- Migration: 104_outbox_events
-- Purpose: Add a transactional outbox for reliable asynchronous delivery.

begin;

create table app.outbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  event_version integer not null default 1 check (event_version > 0),
  payload jsonb not null,
  occurred_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  published_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  deduplication_key text,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, deduplication_key)
);

create index outbox_events_pending_idx
  on app.outbox_events(available_at, occurred_at)
  where published_at is null;
create index outbox_events_aggregate_idx
  on app.outbox_events(tenant_id, aggregate_type, aggregate_id, occurred_at);

commit;
