-- SES Navigator
-- Migration: 014_record_shares
-- Purpose: Provide explicit, optionally expiring record-level sharing.

begin;

create table app.record_shares (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  shared_with_user_id uuid references auth.users(id) on delete cascade,
  shared_with_organization_id uuid,
  permission_level text not null default 'view'
    check (permission_level in ('view','comment','edit')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_reason text,
  foreign key (tenant_id, shared_with_user_id)
    references app.tenant_memberships(tenant_id, user_id) on delete cascade,
  foreign key (tenant_id, shared_with_organization_id)
    references app.organizations(tenant_id, id) on delete cascade,
  check (num_nonnulls(shared_with_user_id, shared_with_organization_id) = 1),
  check (expires_at is null or expires_at > created_at),
  check (revoked_at is null or revoked_at >= created_at)
);

create index record_shares_resource_idx
  on app.record_shares(tenant_id, resource_type, resource_id);
create index record_shares_user_idx
  on app.record_shares(tenant_id, shared_with_user_id)
  where shared_with_user_id is not null and revoked_at is null;
create index record_shares_organization_idx
  on app.record_shares(tenant_id, shared_with_organization_id)
  where shared_with_organization_id is not null and revoked_at is null;

create unique index record_shares_active_user_uidx
  on app.record_shares(tenant_id, resource_type, resource_id, shared_with_user_id)
  where shared_with_user_id is not null and revoked_at is null;
create unique index record_shares_active_organization_uidx
  on app.record_shares(tenant_id, resource_type, resource_id, shared_with_organization_id)
  where shared_with_organization_id is not null and revoked_at is null;

comment on table app.record_shares is 'Explicit record sharing grants for users or organizations.';

commit;
