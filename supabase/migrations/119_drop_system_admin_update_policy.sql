-- SES Navigator
-- Migration: 119_drop_system_admin_update_policy
-- Purpose: Remove direct Data API updates from the system administrator registry.

begin;

-- Administrator lifecycle changes must be performed through a future,
-- purpose-built administrative RPC with explicit actor and target validation.
-- Keep direct table updates closed even if grants are changed elsewhere later.
revoke update on table app.system_admins
  from public, anon, authenticated;

drop policy if exists system_admin_update on app.system_admins;

-- Fail atomically if the direct UPDATE policy still exists.
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c
      on c.oid = p.polrelid
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'app'
      and c.relname = 'system_admins'
      and p.polname = 'system_admin_update'
  ) then
    raise exception
      'app.system_admins policy system_admin_update must not exist';
  end if;
end
$$;

commit;
