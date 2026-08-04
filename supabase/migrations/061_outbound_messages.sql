-- SES Navigator
-- Migration: 061_outbound_messages
-- Purpose: Store outbound communication records related to proposals and sales activities.

begin;

create table app.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  proposal_id uuid,
  project_id uuid,
  engineer_id uuid,
  channel text not null check (channel in ('email','chat','sms','other')),
  subject text,
  body_text text not null,
  status text not null default 'draft' check (status in ('draft','approved','queued','sent','failed','cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  foreign key (tenant_id, proposal_id) references app.proposals(tenant_id, id) on delete set null,
  foreign key (tenant_id, project_id) references app.projects(tenant_id, id) on delete set null,
  foreign key (tenant_id, engineer_id) references app.engineers(tenant_id, id) on delete set null
);

create index outbound_messages_tenant_status_idx on app.outbound_messages(tenant_id, status, created_at desc);
select app.attach_updated_at_trigger('app.outbound_messages'::regclass);

commit;
