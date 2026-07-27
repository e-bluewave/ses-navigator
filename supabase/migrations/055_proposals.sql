-- SES Navigator
-- Migration: 055_proposals
-- Purpose: Define the core proposal record for one project position and engineer.

begin;

create table app.proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  management_no varchar(32) not null,
  project_position_id uuid not null,
  engineer_id uuid not null,
  destination_company_id uuid not null,
  destination_contact_id uuid,
  resume_version_id uuid,
  requirement_version_id uuid,
  proposed_unit_price numeric(15,2),
  currency_code char(3) not null default 'JPY',
  status text not null default 'draft'
    check (status in ('draft','pending_approval','approved','sent','interview_requested','interviewing','offered','won','lost','withdrawn','cancelled')),
  proposed_start_date date,
  validity_date date,
  primary_owner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id),
  unique (tenant_id, management_no),
  foreign key (tenant_id, project_position_id) references app.project_positions(tenant_id, id) on delete restrict,
  foreign key (tenant_id, engineer_id) references app.engineers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, destination_company_id) references app.companies(tenant_id, id) on delete restrict,
  foreign key (tenant_id, destination_contact_id) references app.company_contacts(tenant_id, id) on delete set null,
  foreign key (tenant_id, resume_version_id) references app.engineer_resume_versions(tenant_id, id) on delete set null,
  foreign key (tenant_id, requirement_version_id) references app.project_requirement_versions(tenant_id, id) on delete set null,
  check (proposed_unit_price is null or proposed_unit_price >= 0)
);

create index proposals_status_idx on app.proposals(tenant_id, status, updated_at desc) where deleted_at is null;
create index proposals_engineer_idx on app.proposals(tenant_id, engineer_id, created_at desc) where deleted_at is null;
select app.attach_updated_at_trigger('app.proposals'::regclass);

commit;
