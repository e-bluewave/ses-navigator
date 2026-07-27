-- SES Navigator
-- Migration: 011_tenant_memberships
-- Purpose: Track user membership across tenants and default tenant selection.

begin;

create table app.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_status text not null default 'active'
    check (membership_status in ('invited','active','suspended','retired')),
  is_default boolean not null default false,
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  check (left_at is null or joined_at is null or left_at >= joined_at)
);

create index tenant_memberships_user_id_idx on app.tenant_memberships(user_id);
create index tenant_memberships_tenant_status_idx on app.tenant_memberships(tenant_id, membership_status);
create unique index tenant_memberships_one_default_per_user_uidx
  on app.tenant_memberships(user_id)
  where is_default and membership_status = 'active';

select app.attach_updated_at_trigger('app.tenant_memberships'::regclass);

comment on table app.tenant_memberships is 'User membership history and default selection across tenants.';

commit;
