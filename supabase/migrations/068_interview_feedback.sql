-- SES Navigator
-- Migration: 068_interview_feedback
-- Purpose: Capture interview evaluations and comments.

begin;

create table app.interview_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  interview_id uuid not null,
  evaluator_user_id uuid references auth.users(id) on delete set null,
  evaluator_contact_id uuid,
  evaluation_type text not null default 'internal' check (evaluation_type in ('internal','customer','engineer')),
  overall_rating smallint check (overall_rating between 1 and 5),
  technical_rating smallint check (technical_rating between 1 and 5),
  communication_rating smallint check (communication_rating between 1 and 5),
  recommendation text check (recommendation in ('strong_yes','yes','hold','no','strong_no')),
  comments text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, interview_id) references app.interviews(tenant_id, id) on delete cascade,
  foreign key (tenant_id, evaluator_contact_id) references app.company_contacts(tenant_id, id) on delete set null
);

create index interview_feedback_interview_idx on app.interview_feedback(tenant_id, interview_id);
select app.attach_updated_at_trigger('app.interview_feedback'::regclass);

commit;
