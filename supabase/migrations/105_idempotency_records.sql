-- SES Navigator
-- Migration: 105_idempotency_records
-- Purpose: Prevent duplicate processing of externally retried operations.

begin;

create table app.idempotency_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  actor_type text not null,
  actor_id text not null,
  operation_name text not null,
  idempotency_key text not null,
  request_hash text,
  response_status integer,
  response_body jsonb,
  locked_until timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, actor_type, actor_id, operation_name, idempotency_key),
  check (expires_at > created_at),
  check (response_status is null or response_status between 100 and 599)
);

create index idempotency_records_expiry_idx on app.idempotency_records(expires_at);
select app.attach_updated_at_trigger('app.idempotency_records'::regclass);

commit;
