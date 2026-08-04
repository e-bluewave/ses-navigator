-- SES Navigator
-- Migration: 067_interview_participants
-- Purpose: Store internal and external participants for interviews.

begin;

create table app.interview_participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  interview_id uuid not null,
  participant_type text not null check (participant_type in ('engineer','user','company_contact','other')),
  engineer_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  company_contact_id uuid,
  display_name text,
  email citext,
  role_label text,
  attendance_status text not null default 'expected' check (attendance_status in ('expected','accepted','declined','attended','absent')),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, interview_id) references app.interviews(tenant_id, id) on delete cascade,
  foreign key (tenant_id, engineer_id) references app.engineers(tenant_id, id) on delete set null,
  foreign key (tenant_id, company_contact_id) references app.company_contacts(tenant_id, id) on delete set null,
  check (engineer_id is not null or user_id is not null or company_contact_id is not null or display_name is not null)
);

create index interview_participants_interview_idx on app.interview_participants(tenant_id, interview_id);

commit;
