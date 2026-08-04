-- SES Navigator
-- Migration: 017_company_roles
-- Purpose: Assign one or more time-bounded business roles to a company.

begin;

create table app.company_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  company_id uuid not null,
  role_type text not null
    check (role_type in (
      'customer',
      'business_partner',
      'engineer_employer',
      'end_customer',
      'prime_contractor',
      'supplier',
      'other'
    )),
  valid_from date not null default current_date,
  valid_to date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, company_id, role_type, valid_from),
  foreign key (tenant_id, company_id)
    references app.companies(tenant_id, id) on delete cascade,
  check (valid_to is null or valid_to >= valid_from)
);

create index company_roles_company_idx
  on app.company_roles(tenant_id, company_id);
create index company_roles_active_type_idx
  on app.company_roles(tenant_id, role_type)
  where valid_to is null;
create unique index company_roles_current_uidx
  on app.company_roles(tenant_id, company_id, role_type)
  where valid_to is null;

select app.attach_updated_at_trigger('app.company_roles'::regclass);

comment on table app.company_roles is 'Time-bounded business roles assigned to a company.';

commit;
