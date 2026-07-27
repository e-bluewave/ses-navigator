-- SES Navigator
-- Migration: 004_common_triggers
-- Purpose: Provide a helper for installing updated_at triggers.

begin;

create or replace function app.attach_updated_at_trigger(target regclass)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  trigger_name text := replace(target::text, '.', '_') || '_set_updated_at';
begin
  execute format('drop trigger if exists %I on %s', trigger_name, target);
  execute format(
    'create trigger %I before update on %s for each row execute function app.set_updated_at()',
    trigger_name,
    target
  );
end;
$$;

comment on function app.attach_updated_at_trigger(regclass)
is 'Installs a standard before-update trigger that maintains updated_at.';

commit;
