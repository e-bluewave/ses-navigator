-- SES Navigator
-- Migration: 023_engineer_private_details
-- Purpose: Store sensitive engineer personal information separately.

begin;

create table app.engineer_private_details (
  engineer_id uuid primary key,
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  birth_date date,
  gender text check (gender in ('male','female','other','undisclosed')),
  personal_email citext,
  phone text,
  postal_code varchar(8),
  prefecture text,
  city text,
  address_line text,
  emergency_contact text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  foreign key (tenant_id, engineer_id) references app.engineers(tenant_id, id) on delete cascade
);

create index engineer_private_details_tenant_idx on app.engineer_private_details(tenant_id);
create index engineer_private_details_email_idx
  on app.engineer_private_details(tenant_id, personal_email)
  where personal_email is not null;

select app.attach_updated_at_trigger('app.engineer_private_details'::regclass);

commit;
