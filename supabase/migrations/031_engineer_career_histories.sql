-- SES Navigator
-- Migration: 031_engineer_career_histories
-- Purpose: Store structured engineer career history entries.

begin;

create table app.engineer_career_histories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  engineer_id uuid not null,
  project_name text not null,
  client_name text,
  role_name text,
  industry text,
  overview text,
  responsibilities text,
  achievements text,
  team_size integer,
  started_on date,
  ended_on date,
  display_order integer not null default 0,
  source_resume_version_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id),
  foreign key (tenant_id, engineer_id) references app.engineers(tenant_id, id) on delete cascade,
  check (team_size is null or team_size >= 0),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);

create index engineer_career_histories_engineer_order_idx
  on app.engineer_career_histories(tenant_id, engineer_id, display_order)
  where deleted_at is null;

select app.attach_updated_at_trigger('app.engineer_career_histories'::regclass);

commit;
