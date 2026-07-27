-- SES Navigator
-- Migration: 102_ai_execution_reviews
-- Purpose: Record human review decisions for AI execution results.

begin;

create table app.ai_execution_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  ai_execution_id uuid not null,
  reviewer_id uuid references auth.users(id) on delete set null,
  review_status text not null check (review_status in ('pending','approved','rejected','partially_approved','changes_requested')),
  reviewed_at timestamptz,
  review_comment text,
  approved_output_ids uuid[] not null default '{}'::uuid[],
  rejected_output_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  unique (tenant_id, id),
  foreign key (tenant_id, ai_execution_id) references app.ai_executions(tenant_id, id) on delete cascade,
  check ((review_status = 'pending' and reviewed_at is null) or review_status <> 'pending')
);

create index ai_execution_reviews_execution_idx
  on app.ai_execution_reviews(tenant_id, ai_execution_id, created_at desc);
select app.attach_updated_at_trigger('app.ai_execution_reviews'::regclass);

commit;
