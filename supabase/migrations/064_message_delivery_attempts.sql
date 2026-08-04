-- SES Navigator
-- Migration: 064_message_delivery_attempts
-- Purpose: Record delivery attempts and provider responses for outbound messages.

begin;

create table app.message_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  outbound_message_id uuid not null,
  recipient_id uuid,
  attempt_no integer not null check (attempt_no > 0),
  provider text,
  provider_message_id text,
  status text not null check (status in ('queued','accepted','delivered','bounced','failed')),
  attempted_at timestamptz not null default now(),
  response_code text,
  response_payload jsonb,
  error_message text,
  unique (tenant_id, id),
  unique (outbound_message_id, recipient_id, attempt_no),
  foreign key (tenant_id, outbound_message_id) references app.outbound_messages(tenant_id, id) on delete cascade,
  foreign key (tenant_id, recipient_id) references app.outbound_message_recipients(tenant_id, id) on delete cascade
);

create index message_delivery_attempts_message_idx on app.message_delivery_attempts(tenant_id, outbound_message_id, attempted_at desc);

commit;
