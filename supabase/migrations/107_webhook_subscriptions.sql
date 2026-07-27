-- SES Navigator
-- Migration: 107_webhook_subscriptions
-- Purpose: Define tenant-scoped outbound webhook subscriptions.

begin;

create table app.webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  name text not null,
  endpoint_url text not null,
  event_types text[] not null,
  secret_reference text,
  status text not null default 'active' check (status in ('active','paused','disabled')),
  timeout_seconds integer not null default 10 check (timeout_seconds between 1 and 120),
  max_attempts integer not null default 8 check (max_attempts between 1 and 30),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id),
  unique (tenant_id, name),
  check (cardinality(event_types) > 0)
);

create index webhook_subscriptions_active_idx
  on app.webhook_subscriptions(tenant_id, status)
  where deleted_at is null;
select app.attach_updated_at_trigger('app.webhook_subscriptions'::regclass);

commit;
