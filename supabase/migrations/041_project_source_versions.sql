-- SES Navigator
-- Migration: 041_project_source_versions
-- Purpose: Preserve immutable versions of project source content and offered conditions.

begin;

create table app.project_source_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  project_source_id uuid not null,
  version_no integer not null check (version_no > 0),
  subject text,
  body_text text,
  commercial_flow_text text,
  offered_rate_min bigint,
  offered_rate_max bigint,
  currency_code varchar(3) not null default 'JPY',
  settlement_lower_hours numeric(6,2),
  settlement_upper_hours numeric(6,2),
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  unique (project_source_id, version_no),
  foreign key (tenant_id, project_source_id)
    references app.project_sources(tenant_id, id) on delete cascade,
  check (offered_rate_min is null or offered_rate_max is null or offered_rate_min <= offered_rate_max),
  check (settlement_lower_hours is null or settlement_upper_hours is null or settlement_lower_hours <= settlement_upper_hours)
);

create index project_source_versions_source_idx
  on app.project_source_versions(tenant_id, project_source_id, version_no desc);

comment on table app.project_source_versions is 'Immutable versions of received project source content and source-specific conditions.';

commit;
