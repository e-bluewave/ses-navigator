-- SES Navigator
-- Migration: 062_outbound_message_recipients
-- Purpose: Store recipients for outbound messages.

begin;

create table app.outbound_message_recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  outbound_message_id uuid not null,
  recipient_type text not null check (recipient_type in ('to','cc','bcc')),
  company_contact_id uuid,
  recipient_name text,
  recipient_address citext not null,
  delivery_status text not null default 'pending' check (delivery_status in ('pending','sent','delivered','bounced','failed')),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (outbound_message_id, recipient_type, recipient_address),
  foreign key (tenant_id, outbound_message_id) references app.outbound_messages(tenant_id, id) on delete cascade,
  foreign key (tenant_id, company_contact_id) references app.company_contacts(tenant_id, id) on delete set null
);

create index outbound_message_recipients_message_idx on app.outbound_message_recipients(tenant_id, outbound_message_id);

commit;
