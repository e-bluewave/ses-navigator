-- SES Navigator
-- Migration: 066_interviews
-- Purpose: Manage interviews arranged for proposals.

begin;

create table app.interviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  proposal_id uuid not null,
  interview_round integer not null default 1 check (interview_round > 0),
  interview_type text not null default 'online' check (interview_type in ('online','onsite','phone','other')),
  status text not null default 'scheduled' check (status in ('tentative','scheduled','completed','cancelled','no_show')),
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  location_text text,
  meeting_url text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  foreign key (tenant_id, proposal_id) references app.proposals(tenant_id, id) on delete cascade,
  check (scheduled_end_at is null or scheduled_start_at is null or scheduled_end_at >= scheduled_start_at)
);

create index interviews_tenant_schedule_idx on app.interviews(tenant_id, scheduled_start_at, status);
select app.attach_updated_at_trigger('app.interviews'::regclass);

commit;
