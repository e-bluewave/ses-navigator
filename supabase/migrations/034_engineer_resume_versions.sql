-- SES Navigator
-- Migration: 034_engineer_resume_versions
-- Purpose: Store immutable resume versions and extracted text.

begin;

create table app.engineer_resume_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  resume_id uuid not null,
  version_no integer not null,
  file_storage_path text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  file_checksum text,
  extracted_text text,
  structured_data jsonb not null default '{}'::jsonb,
  source_type text not null default 'upload'
    check (source_type in ('upload','manual','migration','generated')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  unique (resume_id, version_no),
  foreign key (tenant_id, resume_id) references app.engineer_resumes(tenant_id, id) on delete cascade,
  check (version_no > 0),
  check (file_size_bytes is null or file_size_bytes >= 0)
);

create index engineer_resume_versions_resume_idx
  on app.engineer_resume_versions(tenant_id, resume_id, version_no desc);

alter table app.engineer_resumes
  add constraint engineer_resumes_current_version_fk
  foreign key (tenant_id, current_version_id)
  references app.engineer_resume_versions(tenant_id, id)
  on delete set null;

commit;
