-- SES Navigator
-- Migration: 005_tenants
-- Purpose: Define tenant boundaries for all business data.

begin;

create table app.tenants (
  id uuid primary key default gen_random_uuid(),
  code citext not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active','suspended','closed')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select app.attach_updated_at_trigger('app.tenants'::regclass);

comment on table app.tenants is 'Top-level tenant record used for data isolation.';

commit;
