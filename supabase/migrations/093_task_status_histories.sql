-- SES Navigator
-- Migration: 093_task_status_histories
-- Purpose: Preserve task status changes as an append-oriented history.

begin;

create table audit.task_status_histories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  task_id uuid not null,
  from_status text,
  to_status text not null,
  reason text,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  source text not null default 'user' check (source in ('user','system','ai','import')),
  foreign key (tenant_id, task_id) references app.tasks(tenant_id, id) on delete cascade,
  check (from_status is null or from_status <> to_status)
);

create index task_status_histories_task_idx on audit.task_status_histories(tenant_id, task_id, changed_at desc);

commit;
