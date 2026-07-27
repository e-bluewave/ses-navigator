-- SES Navigator
-- Migration: 013_system_admins
-- Purpose: Separate platform administrators from tenant-scoped application roles.

begin;

create table app.system_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  admin_level text not null default 'support'
    check (admin_level in ('support','operator','super_admin')),
  is_active boolean not null default true,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_reason text,
  check (revoked_at is null or revoked_at >= granted_at),
  check ((is_active and revoked_at is null) or not is_active)
);

create index system_admins_active_level_idx
  on app.system_admins(admin_level)
  where is_active;

comment on table app.system_admins is 'Platform-wide administrators managed separately from tenant roles.';

commit;
