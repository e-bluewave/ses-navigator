-- SES Navigator
-- Migration: 110_default_tenant_policies
-- Purpose: Add default tenant-isolation policies to tenant-scoped application tables.

begin;

do $$
declare
  target record;
  visibility_expression text;
begin
  for target in
    select
      c.oid::regclass as table_name,
      exists (
        select 1
        from pg_attribute da
        where da.attrelid = c.oid
          and da.attname = 'deleted_at'
          and not da.attisdropped
      ) as has_deleted_at
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute ta on ta.attrelid = c.oid
    where n.nspname = 'app'
      and c.relkind = 'r'
      and ta.attname = 'tenant_id'
      and not ta.attisdropped
  loop
    visibility_expression := 'app.is_system_admin() or tenant_id = app.current_tenant_id()';
    if target.has_deleted_at then
      visibility_expression := '(' || visibility_expression || ') and deleted_at is null';
    end if;

    execute format('drop policy if exists tenant_select on %s', target.table_name);
    execute format(
      'create policy tenant_select on %s for select to authenticated using (%s)',
      target.table_name,
      visibility_expression
    );

    execute format('drop policy if exists tenant_insert on %s', target.table_name);
    execute format(
      'create policy tenant_insert on %s for insert to authenticated with check (app.is_system_admin() or tenant_id = app.current_tenant_id())',
      target.table_name
    );

    execute format('drop policy if exists tenant_update on %s', target.table_name);
    execute format(
      'create policy tenant_update on %s for update to authenticated using (%s) with check (app.is_system_admin() or tenant_id = app.current_tenant_id())',
      target.table_name,
      visibility_expression
    );
  end loop;
end
$$;

commit;
