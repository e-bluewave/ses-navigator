-- SES Navigator
-- Migration: 088_notifications
begin;
create table app.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text,
  resource_type text,
  resource_id uuid,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  deduplication_key text,
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  unique nulls not distinct (tenant_id, deduplication_key)
);
create index notifications_tenant_schedule_idx on app.notifications(tenant_id, scheduled_at);
commit;