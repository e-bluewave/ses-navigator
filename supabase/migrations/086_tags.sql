-- SES Navigator
-- Migration: 086_tags
begin;
create table app.tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  color text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, normalized_name)
);
select app.attach_updated_at_trigger('app.tags'::regclass);
commit;