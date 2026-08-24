-- SES Navigator
-- BA-019 real-environment validation: precheck
-- Read-only. Do not paste query output containing secrets or personal data into chat/PR.

begin;

select jsonb_pretty(
  jsonb_build_object(
    'status', 'BA019_PRECHECK',
    'project_source_summaries_exists', to_regclass('public.project_source_summaries') is not null,
    'project_sources_exists', to_regclass('app.project_sources') is not null,
    'migration_159_expected', true
  )
) as result;

select
  has_table_privilege('authenticated', 'app.project_sources', 'SELECT') as authenticated_full_project_sources_select,
  case
    when to_regclass('public.project_source_summaries') is null then null
    else has_table_privilege('authenticated', 'public.project_source_summaries', 'SELECT')
  end as authenticated_project_source_summaries_select;

rollback;
