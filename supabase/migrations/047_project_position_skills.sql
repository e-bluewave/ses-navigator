-- SES Navigator
-- Migration: 047_project_position_skills
-- Purpose: Associate required and preferred skills with individual project positions.

begin;

create table app.project_position_skills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  project_position_id uuid not null,
  skill_id uuid not null,
  requirement_type text not null check (requirement_type in ('required','preferred')),
  required_level integer check (required_level between 1 and 5),
  required_months integer check (required_months is null or required_months >= 0),
  weight numeric(5,2) not null default 1.00 check (weight >= 0),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  unique (project_position_id, skill_id, requirement_type),
  foreign key (tenant_id, project_position_id)
    references app.project_positions(tenant_id, id) on delete cascade,
  foreign key (tenant_id, skill_id)
    references app.skills(tenant_id, id) on delete restrict
);

create index project_position_skills_position_idx
  on app.project_position_skills(tenant_id, project_position_id, requirement_type);

select app.attach_updated_at_trigger('app.project_position_skills'::regclass);

commit;
