-- SES Navigator
-- Migration: 069_interview_status_histories
-- Purpose: Preserve interview status transition history.

begin;

create table app.interview_status_histories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  interview_id uuid not null,
  from_status text,
  to_status text not null check (to_status in ('tentative','scheduled','completed','cancelled','no_show')),
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  unique (tenant_id, id),
  foreign key (tenant_id, interview_id) references app.interviews(tenant_id, id) on delete cascade
);

create index interview_status_histories_interview_idx on app.interview_status_histories(tenant_id, interview_id, changed_at desc);

commit;
