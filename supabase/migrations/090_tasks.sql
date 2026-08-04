-- SES Navigator
-- Migration: 090_tasks
begin;
create table app.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open','in_progress','blocked','completed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_at timestamptz,
  completed_at timestamptz,
  deduplication_key text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id),
  unique nulls not distinct (tenant_id, deduplication_key),
  check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);
create index tasks_tenant_status_due_idx on app.tasks(tenant_id, status, due_at) where deleted_at is null;
select app.attach_updated_at_trigger('app.tasks'::regclass);
commit;