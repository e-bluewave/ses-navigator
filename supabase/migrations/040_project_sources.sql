-- SES Navigator
-- Migration: 040_project_sources
-- Purpose: Track multiple receipt sources for a single project.

begin;

create table app.project_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  project_id uuid not null,
  source_company_id uuid,
  source_contact_id uuid,
  source_type text not null default 'email'
    check (source_type in ('email','file','manual','webhook','api','migration')),
  source_reference text,
  received_at timestamptz not null default now(),
  sender_name text,
  sender_email citext,
  original_subject text,
  original_body text,
  commercial_flow_text text,
  is_primary boolean not null default false,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id),
  foreign key (tenant_id, project_id)
    references app.projects(tenant_id, id) on delete cascade,
  foreign key (tenant_id, source_company_id)
    references app.companies(tenant_id, id) on delete set null,
  foreign key (tenant_id, source_contact_id)
    references app.company_contacts(tenant_id, id) on delete set null
);

create index project_sources_project_idx
  on app.project_sources(tenant_id, project_id, received_at desc)
  where deleted_at is null;
create unique index project_sources_one_primary_per_project_uidx
  on app.project_sources(tenant_id, project_id)
  where is_primary and deleted_at is null;

select app.attach_updated_at_trigger('app.project_sources'::regclass);

commit;
