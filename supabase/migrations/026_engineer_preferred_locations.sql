-- SES Navigator
-- Migration: 026_engineer_preferred_locations
-- Purpose: Store searchable preferred work locations for engineers.

begin;

create table app.engineer_preferred_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  engineer_id uuid not null,
  prefecture text,
  city text,
  station_name text,
  max_commute_minutes integer,
  priority smallint not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  foreign key (tenant_id, engineer_id) references app.engineers(tenant_id, id) on delete cascade,
  check (max_commute_minutes is null or max_commute_minutes between 0 and 300),
  check (priority between 1 and 99),
  check (prefecture is not null or city is not null or station_name is not null)
);

create index engineer_preferred_locations_engineer_idx
  on app.engineer_preferred_locations(tenant_id, engineer_id, priority);
create index engineer_preferred_locations_search_idx
  on app.engineer_preferred_locations(tenant_id, prefecture, city, station_name);

commit;
