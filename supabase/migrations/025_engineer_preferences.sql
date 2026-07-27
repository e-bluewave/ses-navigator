-- SES Navigator
-- Migration: 025_engineer_preferences
-- Purpose: Track engineer work and commercial preferences over time.

begin;

create table app.engineer_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  engineer_id uuid not null,
  effective_from date not null default current_date,
  effective_to date,
  desired_rate_min bigint,
  desired_rate_max bigint,
  currency_code char(3) not null default 'JPY',
  remote_preference text not null default 'flexible'
    check (remote_preference in ('onsite','hybrid','remote','flexible')),
  weekly_days_min numeric(3,1),
  weekly_days_max numeric(3,1),
  overtime_limit_hours numeric(5,2),
  available_from date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  foreign key (tenant_id, engineer_id) references app.engineers(tenant_id, id) on delete cascade,
  check (effective_to is null or effective_to >= effective_from),
  check (desired_rate_min is null or desired_rate_min >= 0),
  check (desired_rate_max is null or desired_rate_max >= 0),
  check (desired_rate_min is null or desired_rate_max is null or desired_rate_max >= desired_rate_min),
  check (weekly_days_min is null or weekly_days_min between 0 and 7),
  check (weekly_days_max is null or weekly_days_max between 0 and 7),
  check (weekly_days_min is null or weekly_days_max is null or weekly_days_max >= weekly_days_min)
);

create index engineer_preferences_engineer_idx
  on app.engineer_preferences(tenant_id, engineer_id, effective_from desc);
create unique index engineer_preferences_current_uidx
  on app.engineer_preferences(tenant_id, engineer_id)
  where effective_to is null;

select app.attach_updated_at_trigger('app.engineer_preferences'::regclass);

commit;
