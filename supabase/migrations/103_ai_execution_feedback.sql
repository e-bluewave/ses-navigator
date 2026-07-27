-- SES Navigator
-- Migration: 103_ai_execution_feedback
-- Purpose: Capture structured user feedback for AI quality improvement.

begin;

create table app.ai_execution_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  ai_execution_id uuid not null,
  output_id uuid,
  submitted_by uuid references auth.users(id) on delete set null,
  rating smallint check (rating is null or rating between 1 and 5),
  feedback_type text not null check (feedback_type in ('helpful','incorrect','incomplete','unsafe','format_issue','other')),
  feedback_comment text,
  corrected_text text,
  corrected_json jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, ai_execution_id) references app.ai_executions(tenant_id, id) on delete cascade,
  foreign key (tenant_id, output_id) references app.ai_execution_outputs(tenant_id, id) on delete set null,
  check (num_nonnulls(feedback_comment, corrected_text, corrected_json, rating) >= 1)
);

create index ai_execution_feedback_execution_idx
  on app.ai_execution_feedback(tenant_id, ai_execution_id, created_at desc);

commit;
