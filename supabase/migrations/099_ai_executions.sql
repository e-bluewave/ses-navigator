-- SES Navigator
-- Migration: 099_ai_executions
-- Purpose: Track AI execution requests, models, costs, and lifecycle status.

begin;

create table app.ai_executions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  job_id uuid,
  execution_type text not null,
  provider text not null,
  model_name text not null,
  prompt_version text,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled','review_required')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost numeric(14,6) check (estimated_cost is null or estimated_cost >= 0),
  currency char(3) not null default 'USD',
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  unique (tenant_id, id),
  foreign key (tenant_id, job_id) references app.jobs(tenant_id, id) on delete set null,
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create index ai_executions_tenant_status_idx on app.ai_executions(tenant_id, status, requested_at desc);
create index ai_executions_type_idx on app.ai_executions(tenant_id, execution_type, requested_at desc);
select app.attach_updated_at_trigger('app.ai_executions'::regclass);

commit;
