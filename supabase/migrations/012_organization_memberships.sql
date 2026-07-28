-- SES Navigator
-- Migration: 012_organization_memberships
-- Purpose: Track user membership, position, and primary assignment within organizations.

begin;

create table app.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  organization_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  position_title text,
  membership_status text not null default 'active'
    check (membership_status in ('active','suspended','retired')),
  is_primary boolean not null default false,
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, organization_id, user_id, valid_from),
  foreign key (tenant_id, organization_id)
    references app.organizations(tenant_id, id) on delete restrict,
  foreign key (tenant_id, user_id)
    references app.tenant_memberships(tenant_id, user_id) on delete cascade,
  check (valid_to is null or valid_to >= valid_from)
);

create index organization_memberships_user_id_idx
  on app.organization_memberships(user_id);
create index organization_memberships_org_status_idx
  on app.organization_memberships(tenant_id, organization_id, membership_status);
create unique index organization_memberships_one_primary_uidx
  on app.organization_memberships(tenant_id, user_id)
  where is_primary and membership_status = 'active' and valid_to is null;

alter table app.user_roles
  add constraint user_roles_tenant_membership_fk
  foreign key (tenant_id, user_id)
  references app.tenant_memberships(tenant_id, user_id)
  on delete cascade;

select app.attach_updated_at_trigger('app.organization_memberships'::regclass);

comment on table app.organization_memberships is 'User membership and primary assignment history within tenant organizations.';

commit;
