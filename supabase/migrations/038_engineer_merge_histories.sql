-- SES Navigator
-- Migration: 038_engineer_merge_histories
-- Purpose: Preserve immutable audit details for engineer merges.

begin;

create table app.engineer_merge_histories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  merge_job_id uuid not null,
  source_engineer_id uuid not null,
  target_engineer_id uuid not null,
  entity_type text not null,
  source_record_id uuid,
  target_record_id uuid,
  action_type text not null
    check (action_type in ('moved','merged','skipped','conflict','deleted')),
  before_data jsonb,
  after_data jsonb,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  foreign key (tenant_id, merge_job_id)
    references app.engineer_merge_jobs(tenant_id, id) on delete cascade,
  foreign key (tenant_id, source_engineer_id)
    references app.engineers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, target_engineer_id)
    references app.engineers(tenant_id, id) on delete restrict
);

create index engineer_merge_histories_job_idx
  on app.engineer_merge_histories(tenant_id, merge_job_id, created_at);

commit;
