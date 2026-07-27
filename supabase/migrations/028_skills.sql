-- SES Navigator
-- Migration: 028_skills
-- Purpose: Define shared and tenant-specific skill master records.

begin;

create table app.skills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references app.tenants(id) on delete cascade,
  code citext not null,
  name text not null,
  name_normalized text not null,
  category text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create unique index skills_global_code_uidx
  on app.skills(code)
  where tenant_id is null;
create unique index skills_tenant_code_uidx
  on app.skills(tenant_id, code)
  where tenant_id is not null;
create index skills_name_search_idx
  on app.skills(tenant_id, name_normalized)
  where is_active;
create index skills_category_idx
  on app.skills(tenant_id, category)
  where is_active;

select app.attach_updated_at_trigger('app.skills'::regclass);

commit;
