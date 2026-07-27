-- SES Navigator
-- Migration: 044_project_requirements
-- Purpose: Define current project requirement sets.

begin;

create table app.project_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  project_id uuid not null,
  project_position_id uuid,
  title text not null,
  summary text,
  must_have_text text,
  nice_to_have_text text,
  exclusion_text text,
  selection_notes text,
  current_version_no integer not null default 1 check (current_version_no > 0),
  status text not null default 'active' check (status in ('draft','active','superseded','closed')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects(tenant_id, id) on delete cascade,
  foreign key (tenant_id, project_position_id) references app.project_positions(tenant_id, id) on delete cascade
);

create index project_requirements_project_idx
  on app.project_requirements(tenant_id, project_id, status)
  where deleted_at is null;

select app.attach_updated_at_trigger('app.project_requirements'::regclass);

commit;
