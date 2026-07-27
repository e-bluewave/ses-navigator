-- SES Navigator
-- Migration: 021_company_duplicate_candidates
-- Purpose: Store company duplicate detection candidates and human review decisions.

begin;

create table app.company_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  source_company_id uuid not null,
  candidate_company_id uuid not null,
  match_score numeric(5,4) not null check (match_score between 0 and 1),
  match_reasons jsonb not null default '[]'::jsonb,
  decision text not null default 'pending'
    check (decision in ('pending','duplicate','not_duplicate','needs_review')),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decision_note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, source_company_id, candidate_company_id),
  foreign key (tenant_id, source_company_id) references app.companies(tenant_id, id) on delete cascade,
  foreign key (tenant_id, candidate_company_id) references app.companies(tenant_id, id) on delete cascade,
  check (source_company_id <> candidate_company_id),
  check ((decision = 'pending' and decided_at is null) or decision <> 'pending')
);

create index company_duplicate_candidates_review_idx
  on app.company_duplicate_candidates(tenant_id, decision, match_score desc);

select app.attach_updated_at_trigger('app.company_duplicate_candidates'::regclass);

commit;
