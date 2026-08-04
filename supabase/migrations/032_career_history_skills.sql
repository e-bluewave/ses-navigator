-- SES Navigator
-- Migration: 032_career_history_skills
-- Purpose: Link structured career history entries to skills.

begin;

create table app.career_history_skills (
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  career_history_id uuid not null,
  skill_id uuid not null,
  usage_type text not null default 'used'
    check (usage_type in ('used','primary','supporting')),
  experience_months integer,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (career_history_id, skill_id),
  foreign key (tenant_id, career_history_id)
    references app.engineer_career_histories(tenant_id, id) on delete cascade,
  constraint career_history_skills_skill_fk
    foreign key (skill_id) references app.skills(id) on delete cascade,
  check (experience_months is null or experience_months >= 0)
);

create index career_history_skills_tenant_skill_idx
  on app.career_history_skills(tenant_id, skill_id);

create trigger career_history_skills_validate_skill_scope
before insert or update of tenant_id, skill_id
on app.career_history_skills
for each row execute function app.validate_skill_tenant_scope();

commit;
