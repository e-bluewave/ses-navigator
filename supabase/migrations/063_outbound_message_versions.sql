-- SES Navigator
-- Migration: 063_outbound_message_versions
-- Purpose: Preserve immutable revisions of outbound message content.

begin;

create table app.outbound_message_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  outbound_message_id uuid not null,
  version_no integer not null check (version_no > 0),
  subject text,
  body_text text not null,
  generation_source text not null default 'manual' check (generation_source in ('manual','template','ai','import')),
  prompt_snapshot jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  unique (outbound_message_id, version_no),
  foreign key (tenant_id, outbound_message_id) references app.outbound_messages(tenant_id, id) on delete cascade
);

create index outbound_message_versions_message_idx on app.outbound_message_versions(tenant_id, outbound_message_id, version_no desc);

commit;
