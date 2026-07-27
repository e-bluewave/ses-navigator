-- SES Navigator
-- Migration: 029_skill_aliases
-- Purpose: Define normalized aliases for skill matching and import.

begin;

create table app.skill_aliases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references app.tenants(id) on delete cascade,
  skill_id uuid not null references app.skills(id) on delete cascade,
  alias text not null,
  alias_normalized text not null,
  source text not null default 'manual'
    check (source in ('manual','system','ai','import')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create unique index skill_aliases_global_alias_uidx
  on app.skill_aliases(alias_normalized)
  where tenant_id is null and is_active;
create unique index skill_aliases_tenant_alias_uidx
  on app.skill_aliases(tenant_id, alias_normalized)
  where tenant_id is not null and is_active;
create index skill_aliases_skill_idx on app.skill_aliases(skill_id);

commit;
