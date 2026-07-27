-- SES Navigator
-- Migration: 046_project_skills
-- Purpose: Associate required and preferred skills with projects.

begin;

create table app.project_skills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  project_id uuid not null,
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
  unique (project_id, skill_id, requirement_type),
  foreign key (tenant_id, project_id) references app.projects(tenant_id, id) on delete cascade,
  foreign key (tenant_id, skill_id) references app.skills(tenant_id, id) on delete restrict
);

create index project_skills_project_idx
  on app.project_skills(tenant_id, project_id, requirement_type);

select app.attach_updated_at_trigger('app.project_skills'::regclass);

commit;
