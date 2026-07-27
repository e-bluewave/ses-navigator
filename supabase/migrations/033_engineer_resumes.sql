-- SES Navigator
-- Migration: 033_engineer_resumes
-- Purpose: Define resume containers owned by engineers.

begin;

create table app.engineer_resumes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  engineer_id uuid not null,
  title text not null,
  resume_status text not null default 'active'
    check (resume_status in ('draft','active','archived')),
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
  foreign key (tenant_id, engineer_id) references app.engineers(tenant_id, id) on delete cascade
);

create index engineer_resumes_engineer_idx
  on app.engineer_resumes(tenant_id, engineer_id)
  where deleted_at is null;

select app.attach_updated_at_trigger('app.engineer_resumes'::regclass);

commit;
