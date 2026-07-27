-- SES Navigator
-- Migration: 100_ai_execution_inputs
-- Purpose: Store immutable AI execution inputs and source references.

begin;

create table app.ai_execution_inputs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  ai_execution_id uuid not null,
  input_type text not null,
  sequence_no integer not null default 1 check (sequence_no > 0),
  content_text text,
  content_json jsonb,
  source_resource_type text,
  source_resource_id uuid,
  content_hash text,
  created_at timestamptz not null default now(),
  unique (tenant_id, ai_execution_id, input_type, sequence_no),
  foreign key (tenant_id, ai_execution_id) references app.ai_executions(tenant_id, id) on delete cascade,
  check (num_nonnulls(content_text, content_json, source_resource_id) >= 1),
  check (source_resource_id is null or source_resource_type is not null)
);

create index ai_execution_inputs_execution_idx on app.ai_execution_inputs(tenant_id, ai_execution_id, sequence_no);
create index ai_execution_inputs_source_idx on app.ai_execution_inputs(tenant_id, source_resource_type, source_resource_id);

commit;
