-- SES Navigator
-- Migration: 039_projects
-- Purpose: Define tenant-scoped project master records.

begin;

create table app.projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  management_no varchar(32) not null,
  project_name text not null,
  project_name_normalized text not null,
  summary text,
  project_status text not null default 'draft'
    check (project_status in ('draft','open','on_hold','closed','cancelled')),
  recruitment_status text not null default 'recruiting'
    check (recruitment_status in ('recruiting','paused','filled','ended')),
  primary_customer_company_id uuid,
  primary_owner_user_id uuid references auth.users(id) on delete set null,
  planned_start_on date,
  planned_end_on date,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id),
  unique (tenant_id, management_no),
  foreign key (tenant_id, primary_customer_company_id)
    references app.companies(tenant_id, id) on delete set null,
  check (planned_end_on is null or planned_start_on is null or planned_end_on >= planned_start_on)
);

create index projects_tenant_status_idx
  on app.projects(tenant_id, project_status, recruitment_status)
  where deleted_at is null;
create index projects_tenant_name_idx
  on app.projects(tenant_id, project_name_normalized)
  where deleted_at is null;

select app.attach_updated_at_trigger('app.projects'::regclass);

commit;
