-- SES Navigator
-- Migration: 049_project_contract_conditions
-- Purpose: Track effective-dated project commercial and contract conditions.

begin;

create table app.project_contract_conditions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  project_id uuid not null,
  project_position_id uuid,
  contract_type text,
  billing_unit text not null default 'monthly'
    check (billing_unit in ('monthly','daily','hourly','fixed')),
  rate_min bigint,
  rate_max bigint,
  currency_code varchar(3) not null default 'JPY',
  settlement_lower_hours numeric(6,2),
  settlement_upper_hours numeric(6,2),
  payment_terms_days integer check (payment_terms_days is null or payment_terms_days >= 0),
  interview_count integer check (interview_count is null or interview_count >= 0),
  foreign_national_allowed boolean,
  subcontracting_allowed boolean,
  notes text,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects(tenant_id, id) on delete cascade,
  foreign key (tenant_id, project_position_id) references app.project_positions(tenant_id, id) on delete cascade,
  check (rate_min is null or rate_max is null or rate_min <= rate_max),
  check (settlement_lower_hours is null or settlement_upper_hours is null or settlement_lower_hours <= settlement_upper_hours),
  check (effective_to is null or effective_to >= effective_from)
);

create index project_contract_conditions_project_effective_idx
  on app.project_contract_conditions(tenant_id, project_id, effective_from desc);

select app.attach_updated_at_trigger('app.project_contract_conditions'::regclass);

commit;
