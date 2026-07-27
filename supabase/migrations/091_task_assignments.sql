-- SES Navigator
-- Migration: 091_task_assignments
-- Purpose: Assign tasks to users and organizations.

begin;

create table app.task_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  task_id uuid not null,
  assignee_user_id uuid references auth.users(id) on delete cascade,
  assignee_organization_id uuid,
  assignment_type text not null default 'owner' check (assignment_type in ('owner','collaborator','watcher')),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, task_id, assignee_user_id, assignment_type),
  unique (tenant_id, task_id, assignee_organization_id, assignment_type),
  foreign key (tenant_id, task_id) references app.tasks(tenant_id, id) on delete cascade,
  foreign key (tenant_id, assignee_organization_id) references app.organizations(tenant_id, id) on delete cascade,
  check (num_nonnulls(assignee_user_id, assignee_organization_id) = 1)
);

create index task_assignments_user_idx on app.task_assignments(tenant_id, assignee_user_id);
create index task_assignments_org_idx on app.task_assignments(tenant_id, assignee_organization_id);

commit;
