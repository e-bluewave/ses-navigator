-- SES Navigator
-- Migration: 159_sensitive_source_surface_hardening
-- Purpose: Close raw project-source content and continuously assert sensitive
--          Data API surfaces remain least-privilege.

begin;

-- project_sources contains sender email, source references, original subject/body,
-- and commercial-flow text. Migration 113 granted the whole table for direct
-- RLS reads; replace that broad grant with a reviewed summary view.
revoke select on table app.project_sources from authenticated;

grant select (
  id,
  tenant_id,
  project_id,
  source_company_id,
  source_contact_id,
  source_type,
  received_at,
  sender_name,
  is_primary,
  current_version_id,
  updated_at,
  row_version,
  deleted_at
) on app.project_sources to authenticated;

create or replace view public.project_source_summaries
with (security_barrier = true, security_invoker = true)
as
select
  s.id,
  s.project_id,
  s.source_company_id,
  s.source_contact_id,
  s.source_type,
  s.received_at,
  s.sender_name,
  s.is_primary,
  s.current_version_id,
  s.updated_at,
  s.row_version
from app.project_sources s
where auth.uid() is not null
  and s.deleted_at is null
  and app.can_access_project(s.project_id, 'project.read', 'view');

revoke all on table public.project_source_summaries
  from public, anon, service_role;
grant select on table public.project_source_summaries to authenticated;

comment on view public.project_source_summaries is
  'SECURITY INVOKER project-source metadata without sender email, source reference, original subject/body, or commercial-flow text.';

-- Raw/immutable source payloads, AI input/output payloads, webhook configuration
-- and delivery payloads, and audit base rows have no direct authenticated table
-- surface. Access must remain closed or go through separately reviewed View/RPCs.
do $$
declare
  protected_table regclass;
  project_sources regclass := 'app.project_sources'::regclass;
  allowed_project_source_columns text[] := array[
    'id',
    'tenant_id',
    'project_id',
    'source_company_id',
    'source_contact_id',
    'source_type',
    'received_at',
    'sender_name',
    'is_primary',
    'current_version_id',
    'updated_at',
    'row_version',
    'deleted_at'
  ];
begin
  if not coalesce(
    (
      select c.reloptions @> array[
        'security_barrier=true',
        'security_invoker=true'
      ]
      from pg_catalog.pg_class c
      where c.oid = 'public.project_source_summaries'::regclass
        and c.relkind = 'v'
    ),
    false
  ) then
    raise exception
      'public.project_source_summaries must use SECURITY BARRIER and SECURITY INVOKER';
  end if;

  if has_table_privilege('anon', 'public.project_source_summaries', 'SELECT')
     or not has_table_privilege(
       'authenticated',
       'public.project_source_summaries',
       'SELECT'
     )
     or has_table_privilege(
       'service_role',
       'public.project_source_summaries',
       'SELECT'
     )
  then
    raise exception 'project_source_summaries grants are invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = project_sources
      and a.attnum > 0
      and not a.attisdropped
      and a.attname <> all (allowed_project_source_columns)
      and has_column_privilege(
        'authenticated',
        project_sources,
        a.attname,
        'SELECT'
      )
  ) then
    raise exception
      'authenticated can select an unreviewed project_sources column';
  end if;

  if exists (
    select 1
    from unnest(allowed_project_source_columns) as required_column(column_name)
    where not has_column_privilege(
      'authenticated',
      project_sources,
      required_column.column_name,
      'SELECT'
    )
  ) then
    raise exception
      'authenticated is missing a required project_sources column grant';
  end if;

  foreach protected_table in array array[
    'app.project_source_versions'::regclass,
    'app.engineer_resume_versions'::regclass,
    'app.resume_extraction_results'::regclass,
    'app.project_extraction_results'::regclass,
    'app.ai_execution_inputs'::regclass,
    'app.ai_execution_outputs'::regclass,
    'app.webhook_subscriptions'::regclass,
    'app.webhook_deliveries'::regclass
  ]
  loop
    if has_any_column_privilege('anon', protected_table, 'SELECT')
       or has_any_column_privilege('authenticated', protected_table, 'SELECT')
    then
      raise exception
        'raw sensitive table % must not be directly selectable by client roles',
        protected_table;
    end if;
  end loop;

  -- audit.audit_logs is intentionally column-granted for the SECURITY INVOKER
  -- summary view introduced by migration 117. Full-table SELECT must stay off.
  if has_table_privilege('anon', 'audit.audit_logs', 'SELECT')
     or has_table_privilege('authenticated', 'audit.audit_logs', 'SELECT')
  then
    raise exception 'audit.audit_logs must not have full-table client SELECT';
  end if;
end
$$;

commit;
