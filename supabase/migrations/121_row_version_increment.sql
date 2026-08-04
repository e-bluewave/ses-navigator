-- SES Navigator
-- Migration: 121_row_version_increment
-- Purpose: Increment row_version automatically on updates to optimistic-lock tables.

begin;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  old_row jsonb := to_jsonb(old);
  new_row jsonb := to_jsonb(new);
begin
  new.updated_at = now();

  if new_row ? 'row_version' then
    new := jsonb_populate_record(
      new,
      jsonb_build_object(
        'row_version',
        coalesce((old_row ->> 'row_version')::bigint, 0) + 1
      )
    );
  end if;

  return new;
end;
$$;

comment on function app.set_updated_at()
is 'Maintains updated_at and increments row_version when the target table has that column.';

commit;
