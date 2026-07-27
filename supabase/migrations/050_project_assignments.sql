-- SES Navigator
-- Migration: 050_project_assignments
-- Purpose: Assign users to projects with scoped responsibilities.

begin;

create table app.project_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  project_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_role text not null
    check (assignment_role in ('primary_owner','secondary_owner','support','viewer')),
  is_primary boolean not null default false,
  valid_from date not null default current_date,
  valid_to date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  unique (project_id, user_id, assignment_role, valid_from),
  foreign key (tenant_id, project_id)
    references app.projects(tenant_id, id) on delete cascade,
  check (valid_to is null or valid_to >= valid_from),
  check ((assignment_role = 'primary_owner' and is_primary) or assignment_role <> 'primary_owner')
);

create index project_assignments_project_idx
  on app.project_assignments(tenant_id, project_id, assignment_role);
create index project_assignments_user_idx
  on app.project_assignments(tenant_id, user_id, valid_from desc);
create unique index project_assignments_one_active_primary_uidx
  on app.project_assignments(tenant_id, project_id)
  where assignment_role = 'primary_owner' and is_primary and valid_to is null;

select app.attach_updated_at_trigger('app.project_assignments'::regclass);

commit;
