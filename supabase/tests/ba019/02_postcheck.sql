-- SES Navigator
-- BA-019 real-environment validation: postcheck
-- Read-only catalog/privilege validation. Raises on any unexpected exposure.

begin;

do $$
declare
  protected_table regclass;
  project_sources regclass := 'app.project_sources'::regclass;
  allowed_project_source_columns text[] := array[
    'id', 'tenant_id', 'project_id', 'source_company_id', 'source_contact_id',
    'source_type', 'received_at', 'sender_name', 'is_primary',
    'current_version_id', 'updated_at', 'row_version', 'deleted_at'
  ];
begin
  if to_regclass('public.project_source_summaries') is null then
    raise exception 'public.project_source_summaries is missing';
  end if;

  if not coalesce((
    select c.reloptions @> array['security_barrier=true', 'security_invoker=true']
    from pg_catalog.pg_class c
    where c.oid = 'public.project_source_summaries'::regclass
      and c.relkind = 'v'
  ), false) then
    raise exception 'project_source_summaries must use SECURITY BARRIER and SECURITY INVOKER';
  end if;

  if has_table_privilege('anon', 'public.project_source_summaries', 'SELECT')
     or not has_table_privilege('authenticated', 'public.project_source_summaries', 'SELECT')
     or has_table_privilege('service_role', 'public.project_source_summaries', 'SELECT') then
    raise exception 'project_source_summaries grants are invalid';
  end if;

  if has_table_privilege('authenticated', project_sources, 'SELECT') then
    raise exception 'authenticated must not have full SELECT on app.project_sources';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = project_sources
      and a.attnum > 0
      and not a.attisdropped
      and a.attname <> all (allowed_project_source_columns)
      and has_column_privilege('authenticated', project_sources, a.attname, 'SELECT')
  ) then
    raise exception 'authenticated can select an unreviewed project_sources column';
  end if;

  if exists (
    select 1
    from unnest(allowed_project_source_columns) as required_column(column_name)
    where not has_column_privilege('authenticated', project_sources, required_column.column_name, 'SELECT')
  ) then
    raise exception 'authenticated is missing a required project_sources column grant';
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
  ] loop
    if has_any_column_privilege('anon', protected_table, 'SELECT')
       or has_any_column_privilege('authenticated', protected_table, 'SELECT') then
      raise exception 'raw sensitive table % must not be directly selectable by client roles', protected_table;
    end if;
  end loop;

  if has_table_privilege('anon', 'audit.audit_logs', 'SELECT')
     or has_table_privilege('authenticated', 'audit.audit_logs', 'SELECT') then
    raise exception 'audit.audit_logs must not have full-table client SELECT';
  end if;
end
$$;

select jsonb_pretty(jsonb_build_object(
  'status', 'BA019_POSTCHECK_PASSED',
  'migration', 159,
  'project_source_summary', 'verified',
  'raw_sensitive_surface', 'closed'
)) as result;

rollback;
