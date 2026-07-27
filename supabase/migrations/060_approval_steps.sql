-- SES Navigator
-- Migration: 060_approval_steps
-- Purpose: Define ordered approval steps and individual decisions.

begin;

create table app.approval_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  approval_request_id uuid not null,
  step_no integer not null check (step_no > 0),
  approver_user_id uuid references auth.users(id) on delete set null,
  approver_role_id uuid references app.roles(id) on delete set null,
  status text not null default 'waiting'
    check (status in ('waiting','pending','approved','rejected','skipped','cancelled')),
  assigned_at timestamptz,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (approval_request_id, step_no),
  foreign key (tenant_id, approval_request_id)
    references app.approval_requests(tenant_id, id) on delete cascade,
  check (approver_user_id is not null or approver_role_id is not null)
);

create index approval_steps_pending_user_idx
  on app.approval_steps(tenant_id, approver_user_id, assigned_at)
  where status = 'pending';
create index approval_steps_request_idx
  on app.approval_steps(approval_request_id, step_no);

select app.attach_updated_at_trigger('app.approval_steps'::regclass);

commit;
