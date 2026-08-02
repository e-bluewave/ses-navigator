-- SES Navigator
-- Migration: 118_fix_current_user_search_path
-- Purpose: Pin app.current_user_id() to a safe function-local search path.

begin;

-- Keep the existing function body, volatility, ownership, and grants intact.
-- auth.uid() is schema-qualified, so it remains resolvable without adding the
-- auth schema to the search path.
alter function app.current_user_id()
  set search_path = pg_catalog, public;

-- Fail atomically if the function-local setting was not applied as intended.
do $$
declare
  configured_search_path text;
begin
  select setting
    into configured_search_path
  from pg_catalog.pg_proc p
  cross join lateral unnest(
    coalesce(p.proconfig, array[]::text[])
  ) as setting
  where p.oid = 'app.current_user_id()'::regprocedure
    and setting like 'search_path=%';

  if configured_search_path is distinct from
     'search_path=pg_catalog, public'
  then
    raise exception
      'app.current_user_id() must use search_path = pg_catalog, public';
  end if;
end
$$;

commit;
