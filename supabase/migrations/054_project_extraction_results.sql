-- SES Navigator
-- Migration: 054_project_extraction_results
-- Purpose: Store AI extraction candidates for project information.

begin;

create table app.project_extraction_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  project_id uuid,
  project_source_id uuid,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending','processing','completed','failed','reviewed','applied','rejected')),
  model_provider text,
  model_name text,
  prompt_version text,
  extracted_data jsonb not null default '{}'::jsonb,
  confidence_scores jsonb not null default '{}'::jsonb,
  raw_text text,
  error_message text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, project_id) references app.projects(tenant_id, id) on delete cascade,
  foreign key (tenant_id, project_source_id) references app.project_sources(tenant_id, id) on delete cascade,
  check (project_id is not null or project_source_id is not null)
);

create index project_extraction_results_status_idx
  on app.project_extraction_results(tenant_id, extraction_status, created_at desc);

commit;
