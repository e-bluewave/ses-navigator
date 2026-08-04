-- SES Navigator
-- Migration: 092_task_links
-- Purpose: Link tasks to domain records without polymorphic foreign keys.

begin;

create table app.task_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  task_id uuid not null,
  resource_type text not null,
  resource_id uuid not null,
  link_type text not null default 'related' check (link_type in ('related','blocks','blocked_by','generated_from')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, task_id, resource_type, resource_id, link_type),
  foreign key (tenant_id, task_id) references app.tasks(tenant_id, id) on delete cascade
);

create index task_links_resource_idx on app.task_links(tenant_id, resource_type, resource_id);
create index task_links_task_idx on app.task_links(tenant_id, task_id);

commit;
