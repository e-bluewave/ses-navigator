-- SES Navigator
-- Migration: 074_work_logs
-- Purpose: Store monthly work performance summaries for active contracts.

begin;

create table app.work_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  contract_id uuid not null,
  engineer_id uuid not null,
  work_month date not null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','locked')),
  scheduled_days numeric(6,2),
  actual_days numeric(6,2),
  scheduled_hours numeric(8,2),
  actual_hours numeric(8,2),
  overtime_hours numeric(8,2) not null default 0,
  absence_hours numeric(8,2) not null default 0,
  customer_approved_at timestamptz,
  approved_by_name text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id),
  unique (tenant_id, contract_id, engineer_id, work_month),
  foreign key (tenant_id, contract_id) references app.contracts(tenant_id, id) on delete cascade,
  foreign key (tenant_id, engineer_id) references app.engineers(tenant_id, id) on delete restrict,
  check (work_month = date_trunc('month', work_month)::date),
  check (coalesce(scheduled_days,0) >= 0 and coalesce(actual_days,0) >= 0),
  check (coalesce(scheduled_hours,0) >= 0 and coalesce(actual_hours,0) >= 0),
  check (overtime_hours >= 0 and absence_hours >= 0)
);

create index work_logs_month_idx on app.work_logs(tenant_id, work_month desc, status) where deleted_at is null;
create index work_logs_engineer_idx on app.work_logs(tenant_id, engineer_id, work_month desc) where deleted_at is null;

select app.attach_updated_at_trigger('app.work_logs'::regclass);

commit;