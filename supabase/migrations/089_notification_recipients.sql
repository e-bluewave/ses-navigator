-- SES Navigator
-- Migration: 089_notification_recipients
begin;
create table app.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  notification_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivery_status text not null default 'pending' check (delivery_status in ('pending','delivered','failed','skipped')),
  delivered_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, notification_id, user_id),
  foreign key (tenant_id, notification_id) references app.notifications(tenant_id, id) on delete cascade
);
create index notification_recipients_user_idx on app.notification_recipients(tenant_id, user_id, read_at, created_at desc);
commit;