-- SES Navigator
-- Migration: 075_work_log_details
-- Purpose: Store daily work details belonging to a monthly work log.

begin;

create table app.work_log_details (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  work_log_id uuid not null,
  work_date date not null,
  work_type text not null default 'work' check (work_type in ('work','paid_leave','absence','holiday','training','other')),
  start_time time,
  end_time time,
  break_minutes integer not null default 0,
  work_hours numeric(6,2) not null default 0,
  overtime_hours numeric(6,2) not null default 0,
  description text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id),
  unique (tenant_id, work_log_id, work_date),
  foreign key (tenant_id, work_log_id) references app.work_logs(tenant_id, id) on delete cascade,
  check (break_minutes >= 0),
  check (work_hours >= 0 and overtime_hours >= 0),
  check (end_time is null or start_time is null or end_time > start_time)
);

create index work_log_details_log_date_idx on app.work_log_details(tenant_id, work_log_id, work_date) where deleted_at is null;

select app.attach_updated_at_trigger('app.work_log_details'::regclass);

commit;