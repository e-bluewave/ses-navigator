-- SES Navigator
-- Migration: 045_project_requirement_versions
-- Purpose: Preserve immutable versions of project requirements.

begin;

create table app.project_requirement_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  project_requirement_id uuid not null,
  version_no integer not null check (version_no > 0),
  title text not null,
  summary text,
  must_have_text text,
  nice_to_have_text text,
  exclusion_text text,
  selection_notes text,
  source_project_source_version_id uuid,
  change_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  unique (project_requirement_id, version_no),
  foreign key (tenant_id, project_requirement_id)
    references app.project_requirements(tenant_id, id) on delete cascade,
  foreign key (tenant_id, source_project_source_version_id)
    references app.project_source_versions(tenant_id, id) on delete set null
);

create index project_requirement_versions_requirement_idx
  on app.project_requirement_versions(tenant_id, project_requirement_id, version_no desc);

commit;
