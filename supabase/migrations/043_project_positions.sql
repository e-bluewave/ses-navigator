-- SES Navigator
-- Migration: 043_project_positions
-- Purpose: Define recruitable positions within projects.

begin;

create table app.project_positions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  project_id uuid not null,
  management_no varchar(32) not null,
  title text not null,
  role_name text,
  openings integer not null default 1 check (openings > 0),
  status text not null default 'open'
    check (status in ('draft','open','paused','filled','closed')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  start_date date,
  end_date date,
  desired_start_date date,
  description text,
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
  foreign key (tenant_id, project_id) references app.projects(tenant_id, id) on delete cascade,
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index project_positions_project_status_idx
  on app.project_positions(tenant_id, project_id, status)
  where deleted_at is null;

select app.attach_updated_at_trigger('app.project_positions'::regclass);

commit;
