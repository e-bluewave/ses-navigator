-- SES Navigator
-- Migration: 070_interview_outcomes
-- Purpose: Record final interview decisions and follow-up actions.

begin;

create table app.interview_outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  interview_id uuid not null,
  outcome text not null check (outcome in ('pass','fail','hold','withdrawn','pending')),
  decided_at timestamptz,
  decision_source text check (decision_source in ('customer','internal','engineer','system')),
  reason text,
  next_action text,
  next_action_due_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  unique (tenant_id, interview_id),
  foreign key (tenant_id, interview_id) references app.interviews(tenant_id, id) on delete cascade
);

create index interview_outcomes_due_idx on app.interview_outcomes(tenant_id, next_action_due_at) where next_action_due_at is not null;
select app.attach_updated_at_trigger('app.interview_outcomes'::regclass);

commit;
