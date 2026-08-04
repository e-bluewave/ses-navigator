-- SES Navigator
-- Migration: 058_proposal_outcomes
-- Purpose: Store structured proposal results and reasons.

begin;

create table app.proposal_outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  proposal_id uuid not null,
  outcome_type text not null
    check (outcome_type in ('interview_requested','rejected','withdrawn','declined','offered','won','lost','cancelled')),
  outcome_date date not null default current_date,
  reason_code text,
  reason_detail text,
  source_company_id uuid,
  source_contact_id uuid,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  foreign key (tenant_id, proposal_id) references app.proposals(tenant_id, id) on delete cascade,
  foreign key (tenant_id, source_company_id) references app.companies(tenant_id, id) on delete set null,
  foreign key (tenant_id, source_contact_id) references app.company_contacts(tenant_id, id) on delete set null
);

create index proposal_outcomes_proposal_idx
  on app.proposal_outcomes(tenant_id, proposal_id, outcome_date desc);
create index proposal_outcomes_type_idx
  on app.proposal_outcomes(tenant_id, outcome_type, outcome_date desc);

commit;
