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

-- Referencing tenant rows may use either a shared skill (tenant_id is null)
-- or a skill owned by the same tenant. A regular composite FK cannot represent
-- both cases, so child tables combine an FK to skills(id) with this trigger.
create or replace function app.validate_skill_tenant_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  referenced_tenant_id uuid;
begin
  select skill.tenant_id
    into referenced_tenant_id
    from app.skills as skill
   where skill.id = new.skill_id;

  -- Let the regular foreign key report a missing skill.
  if not found then
    return new;
  end if;

  if referenced_tenant_id is not null
     and referenced_tenant_id <> new.tenant_id then
    raise foreign_key_violation
      using message = format(
        'skill %s is not shared and does not belong to tenant %s',
        new.skill_id,
        new.tenant_id
      );
  end if;

  return new;
end;
$$;

comment on function app.validate_skill_tenant_scope()
is 'Allows a skill reference only when the skill is shared or belongs to the referencing tenant.';

revoke all on function app.validate_skill_tenant_scope() from public;

-- Changing a skill between shared and tenant-specific scope could invalidate
-- existing child rows, so scope is immutable after creation.
create or replace function app.prevent_skill_tenant_scope_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise check_violation
      using message = format(
        'skill %s tenant scope cannot be changed',
        old.id
      );
  end if;

  return new;
end;
$$;

create trigger skills_prevent_tenant_scope_change
before update of tenant_id on app.skills
for each row execute function app.prevent_skill_tenant_scope_change();

select app.attach_updated_at_trigger('app.skills'::regclass);

commit;
