-- SES Navigator
-- Migration: 106_audit_logs
-- Purpose: Store append-only audit records for important data and security events.

begin;

create table audit.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references app.tenants(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'user' check (actor_type in ('user','service','system','anonymous')),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  request_id text,
  source_ip inet,
  user_agent text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_tenant_occurred_idx
  on audit.audit_logs(tenant_id, occurred_at desc);
create index audit_logs_resource_idx
  on audit.audit_logs(tenant_id, resource_type, resource_id, occurred_at desc);
create index audit_logs_actor_idx
  on audit.audit_logs(actor_user_id, occurred_at desc);

revoke update, delete, truncate on audit.audit_logs from public, anon, authenticated;

commit;
