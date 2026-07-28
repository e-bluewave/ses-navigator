-- SES Navigator
-- Migration: 007_user_profiles
-- Purpose: Extend Supabase auth users with one global application profile per user.

begin;

create table app.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email citext,
  status text not null default 'active' check (status in ('invited','active','suspended','retired')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_profiles_status_idx on app.user_profiles(status);
select app.attach_updated_at_trigger('app.user_profiles'::regclass);

commit;
