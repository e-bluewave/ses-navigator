-- SES Navigator
-- Migration: 094_saved_searches
-- Purpose: Store reusable personal and shared search definitions.

begin;

create table app.saved_searches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  resource_type text not null,
  query_definition jsonb not null default '{}'::jsonb,
  is_shared boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id),
  unique (tenant_id, owner_user_id, resource_type, name)
);

create index saved_searches_owner_idx on app.saved_searches(tenant_id, owner_user_id, resource_type) where deleted_at is null;
select app.attach_updated_at_trigger('app.saved_searches'::regclass);

commit;
