-- SES Navigator
-- Migration: 003_common_functions
-- Purpose: Define reusable database utility functions.

begin;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app.normalize_text(value text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(trim(regexp_replace(lower(unaccent(coalesce(value, ''))), '\s+', ' ', 'g')), '');
$$;

create or replace function app.current_user_id()
returns uuid
language sql
stable
security invoker
as $$
  select auth.uid();
$$;

commit;
