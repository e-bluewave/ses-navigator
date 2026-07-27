-- SES Navigator
-- Migration: 108_webhook_deliveries
-- Purpose: Track webhook delivery requests and final outcomes.

begin;

create table app.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  webhook_subscription_id uuid not null,
  outbox_event_id uuid,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','succeeded','failed','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  last_http_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, webhook_subscription_id) references app.webhook_subscriptions(tenant_id, id) on delete cascade,
  foreign key (tenant_id, outbox_event_id) references app.outbox_events(tenant_id, id) on delete set null,
  check (last_http_status is null or last_http_status between 100 and 599)
);

create index webhook_deliveries_pending_idx
  on app.webhook_deliveries(status, next_attempt_at, created_at)
  where status in ('pending','failed');
create index webhook_deliveries_subscription_idx
  on app.webhook_deliveries(tenant_id, webhook_subscription_id, created_at desc);
select app.attach_updated_at_trigger('app.webhook_deliveries'::regclass);

commit;
