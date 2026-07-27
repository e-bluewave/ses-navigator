-- SES Navigator
-- Migration: 030_engineer_skills
-- Purpose: Store searchable engineer skill experience and verification details.

begin;

create table app.engineer_skills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  engineer_id uuid not null,
  skill_id uuid not null references app.skills(id) on delete restrict,
  experience_months integer,
  proficiency_level smallint,
  last_used_on date,
  evidence_type text
    check (evidence_type in ('resume','career_history','interview','assessment','self_report','other')),
  evidence_note text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','ai_extracted','reviewed','verified','rejected')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  foreign key (tenant_id, engineer_id) references app.engineers(tenant_id, id) on delete cascade,
  unique (tenant_id, engineer_id, skill_id),
  check (experience_months is null or experience_months >= 0),
  check (proficiency_level is null or proficiency_level between 1 and 5),
  check (verification_status <> 'verified' or verified_at is not null)
);

create index engineer_skills_engineer_idx
  on app.engineer_skills(tenant_id, engineer_id, is_primary desc);
create index engineer_skills_skill_search_idx
  on app.engineer_skills(tenant_id, skill_id, experience_months desc);
create index engineer_skills_verified_idx
  on app.engineer_skills(tenant_id, verification_status);

select app.attach_updated_at_trigger('app.engineer_skills'::regclass);

commit;
