-- SES Navigator
-- Migration: 059_approval_requests
-- Purpose: Define reusable approval requests for proposals, contracts, and other records.

begin;

create table app.approval_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  request_type text not null default 'standard',
  status text not null default 'pending'
    check (status in ('draft','pending','approved','rejected','cancelled','expired')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz,
  completed_at timestamptz,
  due_at timestamptz,
  request_note text,
  decision_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create index approval_requests_target_idx
  on app.approval_requests(tenant_id, target_type, target_id, created_at desc);
create index approval_requests_pending_idx
  on app.approval_requests(tenant_id, due_at, created_at)
  where status = 'pending';

select app.attach_updated_at_trigger('app.approval_requests'::regclass);

commit;
