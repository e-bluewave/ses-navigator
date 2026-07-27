-- SES Navigator
-- Migration: 007_user_profiles
-- Purpose: Extend Supabase auth users with tenant-scoped application profiles.

begin;

create table app.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  organization_id uuid references app.organizations(id) on delete set null,
  display_name text not null,
  email citext,
  status text not null default 'active' check (status in ('invited','active','suspended','retired')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_profiles_tenant_id_idx on app.user_profiles(tenant_id);
create index user_profiles_organization_id_idx on app.user_profiles(organization_id);
select app.attach_updated_at_trigger('app.user_profiles'::regclass);

commit;
