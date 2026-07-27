-- SES Navigator
-- Migration: 101_ai_execution_outputs
-- Purpose: Store immutable outputs produced by AI executions.

begin;

create table app.ai_execution_outputs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  ai_execution_id uuid not null,
  output_type text not null,
  sequence_no integer not null default 1 check (sequence_no > 0),
  content_text text,
  content_json jsonb,
  confidence_score numeric(6,5) check (confidence_score is null or confidence_score between 0 and 1),
  schema_version text,
  content_hash text,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, ai_execution_id, output_type, sequence_no),
  foreign key (tenant_id, ai_execution_id) references app.ai_executions(tenant_id, id) on delete cascade,
  check (num_nonnulls(content_text, content_json) >= 1)
);

create index ai_execution_outputs_execution_idx
  on app.ai_execution_outputs(tenant_id, ai_execution_id, sequence_no);

commit;
