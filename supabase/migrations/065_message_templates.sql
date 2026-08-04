-- SES Navigator
-- Migration: 065_message_templates
-- Purpose: Define reusable tenant-scoped outbound message templates.

begin;

create table app.message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  code citext not null,
  name text not null,
  channel text not null check (channel in ('email','chat','sms','other')),
  subject_template text,
  body_template text not null,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  unique (tenant_id, code)
);

create index message_templates_tenant_active_idx on app.message_templates(tenant_id, is_active);
select app.attach_updated_at_trigger('app.message_templates'::regclass);

commit;
