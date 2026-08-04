-- SES Navigator
-- Migration: 048_project_work_conditions
-- Purpose: Track effective-dated project work-location and schedule conditions.

begin;

create table app.project_work_conditions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  project_id uuid not null,
  project_position_id uuid,
  workplace_text text,
  prefecture text,
  nearest_station text,
  remote_type text check (remote_type in ('onsite','hybrid','remote','negotiable')),
  remote_days_per_week integer check (remote_days_per_week between 0 and 7),
  work_start_time time,
  work_end_time time,
  monthly_standard_hours numeric(6,2),
  overtime_notes text,
  dress_code text,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects(tenant_id, id) on delete cascade,
  foreign key (tenant_id, project_position_id) references app.project_positions(tenant_id, id) on delete cascade,
  check (effective_to is null or effective_to >= effective_from),
  check (work_end_time is null or work_start_time is null or work_end_time > work_start_time)
);

create index project_work_conditions_project_effective_idx
  on app.project_work_conditions(tenant_id, project_id, effective_from desc);

select app.attach_updated_at_trigger('app.project_work_conditions'::regclass);

commit;
