-- SES Navigator
-- Migration: 035_resume_extraction_results
-- Purpose: Store AI extraction candidates before human approval.

begin;

create table app.resume_extraction_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  resume_version_id uuid not null,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending','processing','completed','failed','approved','rejected')),
  model_provider text,
  model_name text,
  prompt_version text,
  extracted_profile jsonb not null default '{}'::jsonb,
  extracted_career_histories jsonb not null default '[]'::jsonb,
  extracted_skills jsonb not null default '[]'::jsonb,
  confidence_score numeric(5,4),
  error_message text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  foreign key (tenant_id, resume_version_id)
    references app.engineer_resume_versions(tenant_id, id) on delete cascade,
  check (confidence_score is null or confidence_score between 0 and 1)
);

create index resume_extraction_results_version_idx
  on app.resume_extraction_results(tenant_id, resume_version_id, created_at desc);
create index resume_extraction_results_status_idx
  on app.resume_extraction_results(tenant_id, extraction_status, created_at desc);

commit;
