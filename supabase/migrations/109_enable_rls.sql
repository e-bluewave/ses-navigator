-- SES Navigator
-- Migration: 109_enable_rls
-- Purpose: Enable and force Row Level Security on every tenant-scoped application table.

begin;

do $$
declare
  target record;
begin
  for target in
    select c.oid::regclass as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'app'
      and c.relkind = 'r'
      and a.attname = 'tenant_id'
      and not a.attisdropped
  loop
    execute format('alter table %s enable row level security', target.table_name);
    execute format('alter table %s force row level security', target.table_name);
  end loop;
end
$$;

commit;
