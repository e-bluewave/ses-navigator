-- SES Navigator
-- Migration: 151_project_extraction_review_rpc
-- Purpose: Manage AI project extraction requests, results, and human-approved application.

begin;

alter table app.project_extraction_results
  add column ai_execution_id uuid,
  add column review_notes text;

alter table app.project_extraction_results
  add constraint project_extraction_results_ai_execution_fk
  foreign key (tenant_id, ai_execution_id)
  references app.ai_executions(tenant_id, id)
  on delete set null (ai_execution_id);

create unique index project_extraction_results_ai_execution_idx
  on app.project_extraction_results(tenant_id, ai_execution_id)
  where ai_execution_id is not null;

create or replace function public.request_project_extraction(
  p_project_id uuid,
  p_source_text text,
  p_source_title text,
  p_provider text,
  p_model_name text,
  p_prompt_version text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  execution app.ai_executions%rowtype;
  extraction app.project_extraction_results%rowtype;
begin
  if auth.uid() is null or tenant is null
     or p_project_id is null
     or char_length(btrim(coalesce(p_source_text, ''))) not between 50 and 100000
     or char_length(coalesce(p_source_title, '')) > 300
     or nullif(btrim(p_provider), '') is null
     or nullif(btrim(p_model_name), '') is null
     or nullif(btrim(p_prompt_version), '') is null
     or not app.has_permission('ai.execute')
     or not app.can_access_project(p_project_id, 'project.manage', 'edit')
  then
    raise exception 'project extraction is not executable' using errcode = '42501';
  end if;

  if exists (
    select 1 from app.project_extraction_results x
    where x.tenant_id = tenant and x.project_id = p_project_id
      and x.extraction_status in ('pending', 'processing')
  ) then
    raise exception 'project extraction is already running' using errcode = '23505';
  end if;

  insert into app.ai_executions(
    tenant_id, execution_type, provider, model_name, prompt_version,
    status, requested_by, started_at, metadata
  ) values (
    tenant, 'project.extract', btrim(p_provider), btrim(p_model_name),
    btrim(p_prompt_version), 'running', auth.uid(), now(),
    jsonb_build_object('project_id', p_project_id, 'source_title', nullif(btrim(p_source_title), ''))
  ) returning * into execution;

  insert into app.ai_execution_inputs(
    tenant_id, ai_execution_id, input_type, content_text,
    source_resource_type, source_resource_id, content_hash
  ) values (
    tenant, execution.id, 'project_text', p_source_text,
    'project', p_project_id,
    encode(public.digest(convert_to(p_source_text, 'UTF8'), 'sha256'), 'hex')
  );

  insert into app.project_extraction_results(
    tenant_id, project_id, ai_execution_id, extraction_status,
    model_provider, model_name, prompt_version, raw_text
  ) values (
    tenant, p_project_id, execution.id, 'processing', btrim(p_provider),
    btrim(p_model_name), btrim(p_prompt_version), p_source_text
  ) returning * into extraction;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type,
    resource_id, request_id, metadata
  ) values (
    tenant, auth.uid(), 'user', 'project.extraction_requested',
    'project', p_project_id, nullif(p_request_id, ''),
    jsonb_build_object('extraction_id', extraction.id, 'ai_execution_id', execution.id)
  );

  return jsonb_build_object(
    'extraction_id', extraction.id,
    'ai_execution_id', execution.id,
    'status', extraction.extraction_status
  );
end
$$;

create or replace function public.complete_project_extraction(
  p_extraction_id uuid,
  p_ai_execution_id uuid,
  p_result jsonb,
  p_input_tokens integer default null,
  p_output_tokens integer default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare tenant uuid := app.current_tenant_id();
begin
  if auth.uid() is null or tenant is null
     or jsonb_typeof(p_result) is distinct from 'object'
     or jsonb_typeof(p_result->'requiredSkills') is distinct from 'array'
     or jsonb_typeof(p_result->'preferredSkills') is distinct from 'array'
     or jsonb_typeof(p_result->'commercial') is distinct from 'object'
     or jsonb_typeof(p_result->'workConditions') is distinct from 'object'
     or jsonb_typeof(p_result->'companyCandidates') is distinct from 'array'
     or jsonb_typeof(p_result->'uncertainties') is distinct from 'array'
     or jsonb_typeof(p_result->'confidenceScore') is distinct from 'number'
     or (p_result->>'confidenceScore')::numeric not between 0 and 1
     or not app.has_permission('ai.execute')
  then
    raise exception 'project extraction result is invalid' using errcode = '22023';
  end if;

  update app.project_extraction_results x set
    extraction_status = 'completed',
    extracted_data = p_result,
    confidence_scores = jsonb_build_object('overall', p_result->'confidenceScore'),
    error_message = null
  from app.ai_executions a
  where x.id = p_extraction_id and x.tenant_id = tenant
    and x.ai_execution_id = p_ai_execution_id
    and x.extraction_status = 'processing'
    and a.id = p_ai_execution_id and a.tenant_id = tenant
    and a.requested_by = auth.uid() and a.status = 'running';
  if not found then
    raise exception 'project extraction is not completable' using errcode = '42501';
  end if;

  insert into app.ai_execution_outputs(
    tenant_id, ai_execution_id, output_type, content_json,
    confidence_score, schema_version
  ) values (
    tenant, p_ai_execution_id, 'project_extraction', p_result,
    (p_result->>'confidenceScore')::numeric, 'project.extract.v1'
  );
  update app.ai_executions set
    status = 'review_required', completed_at = now(),
    input_tokens = p_input_tokens, output_tokens = p_output_tokens
  where id = p_ai_execution_id and tenant_id = tenant;
  return true;
end
$$;

create or replace function public.fail_project_extraction(
  p_extraction_id uuid,
  p_ai_execution_id uuid,
  p_error_code text,
  p_error_message text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare tenant uuid := app.current_tenant_id();
begin
  if auth.uid() is null or tenant is null or not app.has_permission('ai.execute') then
    raise exception 'project extraction is not fail-able' using errcode = '42501';
  end if;
  update app.project_extraction_results x set
    extraction_status = 'failed',
    error_message = left(coalesce(p_error_message, 'AI extraction failed'), 2000)
  from app.ai_executions a
  where x.id = p_extraction_id and x.tenant_id = tenant
    and x.ai_execution_id = p_ai_execution_id
    and a.id = p_ai_execution_id and a.tenant_id = tenant
    and a.requested_by = auth.uid() and x.extraction_status = 'processing';
  if not found then return false; end if;
  update app.ai_executions set
    status = 'failed', completed_at = now(),
    error_code = left(coalesce(p_error_code, 'ai_error'), 100),
    error_message = left(coalesce(p_error_message, 'AI extraction failed'), 2000)
  where id = p_ai_execution_id and tenant_id = tenant;
  return true;
end
$$;

create or replace function public.get_project_extraction(
  p_project_id uuid,
  p_extraction_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare result jsonb;
begin
  if auth.uid() is null
     or not app.can_access_project(p_project_id, 'project.read', 'view')
     or not (app.has_permission('ai.read') or app.has_permission('ai.review'))
  then
    raise exception 'project extraction is not accessible' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', x.id, 'project_id', x.project_id, 'ai_execution_id', a.id,
    'status', x.extraction_status, 'provider', x.model_provider,
    'model_name', x.model_name, 'prompt_version', x.prompt_version,
    'result', case when x.extraction_status in ('completed','reviewed','applied','rejected')
      then x.extracted_data else null end,
    'error_message', x.error_message, 'review_notes', x.review_notes,
    'reviewed_at', x.reviewed_at, 'applied_at', x.applied_at,
    'created_at', x.created_at
  ) into result
  from app.project_extraction_results x
  left join app.ai_executions a on a.tenant_id = x.tenant_id and a.id = x.ai_execution_id
  where x.project_id = p_project_id
    and (p_extraction_id is null or x.id = p_extraction_id)
    and (a.requested_by = auth.uid() or app.has_permission('ai.read', null) or app.has_permission('ai.review', null))
  order by x.created_at desc
  limit 1;
  return result;
end
$$;

create or replace function public.review_project_extraction(
  p_project_id uuid,
  p_extraction_id uuid,
  p_decision text,
  p_corrected_result jsonb default null,
  p_review_notes text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  extraction app.project_extraction_results%rowtype;
  execution app.ai_executions%rowtype;
  canonical jsonb;
  source app.project_sources%rowtype;
  source_version app.project_source_versions%rowtype;
  requirement app.project_requirements%rowtype;
  output_ids uuid[];
begin
  if auth.uid() is null or tenant is null
     or p_decision not in ('approved', 'rejected')
     or char_length(coalesce(p_review_notes, '')) > 2000
     or not app.has_permission('ai.review')
     or not app.can_access_project(p_project_id, 'project.manage', 'edit')
     or (p_corrected_result is not null and (
       jsonb_typeof(p_corrected_result) is distinct from 'object'
       or jsonb_typeof(p_corrected_result->'requiredSkills') is distinct from 'array'
       or jsonb_typeof(p_corrected_result->'preferredSkills') is distinct from 'array'
       or jsonb_typeof(p_corrected_result->'commercial') is distinct from 'object'
       or jsonb_typeof(p_corrected_result->'workConditions') is distinct from 'object'
       or jsonb_typeof(p_corrected_result->'companyCandidates') is distinct from 'array'
       or jsonb_typeof(p_corrected_result->'uncertainties') is distinct from 'array'
       or jsonb_typeof(p_corrected_result->'confidenceScore') is distinct from 'number'
       or (p_corrected_result->>'confidenceScore')::numeric not between 0 and 1
     ))
  then
    raise exception 'project extraction review is invalid' using errcode = '42501';
  end if;

  select x, a into extraction, execution
  from app.project_extraction_results x
  join app.ai_executions a on a.id = x.ai_execution_id and a.tenant_id = x.tenant_id
  where x.id = p_extraction_id and x.tenant_id = tenant
    and x.project_id = p_project_id and x.extraction_status = 'completed'
  for update of x;
  if not found then
    raise exception 'project extraction is not reviewable' using errcode = '42501';
  end if;
  canonical := coalesce(p_corrected_result, extraction.extracted_data);

  if p_decision = 'approved' then
    update app.projects set
      project_name = coalesce(nullif(btrim(canonical->>'projectName'), ''), project_name),
      project_name_normalized = lower(normalize(coalesce(nullif(btrim(canonical->>'projectName'), ''), project_name), NFKC)),
      summary = coalesce(nullif(btrim(canonical->>'summary'), ''), summary),
      planned_start_on = coalesce(nullif(canonical->>'startOn', '')::date, planned_start_on),
      planned_end_on = coalesce(nullif(canonical->>'endOn', '')::date, planned_end_on),
      updated_by = auth.uid()
    where id = p_project_id and tenant_id = tenant;

    insert into app.project_sources(
      tenant_id, project_id, source_type, original_subject, original_body,
      commercial_flow_text, is_primary, created_by, updated_by
    ) values (
      tenant, p_project_id, 'manual', nullif(execution.metadata->>'source_title', ''),
      extraction.raw_text, nullif(canonical->'commercial'->>'commercialFlow', ''),
      not exists (select 1 from app.project_sources s where s.project_id = p_project_id and s.tenant_id = tenant and s.deleted_at is null),
      auth.uid(), auth.uid()
    ) returning * into source;
    insert into app.project_source_versions(
      tenant_id, project_source_id, version_no, subject, body_text,
      commercial_flow_text, offered_rate_min, offered_rate_max, currency_code,
      settlement_lower_hours, settlement_upper_hours, raw_payload, received_at, created_by
    ) values (
      tenant, source.id, 1, source.original_subject, extraction.raw_text,
      nullif(canonical->'commercial'->>'commercialFlow', ''),
      nullif(canonical->'commercial'->>'rateMin', '')::bigint,
      nullif(canonical->'commercial'->>'rateMax', '')::bigint,
      coalesce(nullif(canonical->'commercial'->>'currencyCode', ''), 'JPY'),
      nullif(canonical->'commercial'->>'settlementLowerHours', '')::numeric,
      nullif(canonical->'commercial'->>'settlementUpperHours', '')::numeric,
      canonical, now(), auth.uid()
    ) returning * into source_version;
    update app.project_sources set current_version_id = source_version.id where id = source.id;

    insert into app.project_requirements(
      tenant_id, project_id, title, summary, must_have_text,
      nice_to_have_text, exclusion_text, selection_notes, created_by, updated_by
    ) values (
      tenant, p_project_id, 'AI抽出要件', nullif(canonical->>'responsibilities', ''),
      (select string_agg('- ' || value->>'name', E'\n') from jsonb_array_elements(canonical->'requiredSkills')),
      (select string_agg('- ' || value->>'name', E'\n') from jsonb_array_elements(canonical->'preferredSkills')),
      (select string_agg('- ' || value, E'\n') from jsonb_array_elements_text(canonical->'commercial'->'restrictions')),
      (select string_agg('- ' || value, E'\n') from jsonb_array_elements_text(canonical->'uncertainties')),
      auth.uid(), auth.uid()
    ) returning * into requirement;
    insert into app.project_requirement_versions(
      tenant_id, project_requirement_id, version_no, title, summary,
      must_have_text, nice_to_have_text, exclusion_text, selection_notes,
      source_project_source_version_id, change_reason, created_by
    ) values (
      tenant, requirement.id, 1, requirement.title, requirement.summary,
      requirement.must_have_text, requirement.nice_to_have_text,
      requirement.exclusion_text, requirement.selection_notes,
      source_version.id, 'AI抽出結果を人が承認', auth.uid()
    );

    insert into app.project_work_conditions(
      tenant_id, project_id, workplace_text, prefecture, nearest_station,
      remote_type, remote_days_per_week, work_start_time, work_end_time,
      effective_from, created_by, updated_by
    ) values (
      tenant, p_project_id, nullif(canonical->'workConditions'->>'workplace', ''),
      nullif(canonical->'workConditions'->>'prefecture', ''),
      nullif(canonical->'workConditions'->>'nearestStation', ''),
      nullif(canonical->'workConditions'->>'remoteType', ''),
      nullif(canonical->'workConditions'->>'remoteDaysPerWeek', '')::integer,
      nullif(canonical->'workConditions'->>'workStartTime', '')::time,
      nullif(canonical->'workConditions'->>'workEndTime', '')::time,
      coalesce(nullif(canonical->>'startOn', '')::date, current_date), auth.uid(), auth.uid()
    );
    insert into app.project_contract_conditions(
      tenant_id, project_id, contract_type, rate_min, rate_max, currency_code,
      settlement_lower_hours, settlement_upper_hours, payment_terms_days,
      interview_count, notes, effective_from, created_by, updated_by
    ) values (
      tenant, p_project_id, nullif(canonical->'commercial'->>'contractType', ''),
      nullif(canonical->'commercial'->>'rateMin', '')::bigint,
      nullif(canonical->'commercial'->>'rateMax', '')::bigint,
      coalesce(nullif(canonical->'commercial'->>'currencyCode', ''), 'JPY'),
      nullif(canonical->'commercial'->>'settlementLowerHours', '')::numeric,
      nullif(canonical->'commercial'->>'settlementUpperHours', '')::numeric,
      nullif(canonical->'commercial'->>'paymentTermsDays', '')::integer,
      nullif(canonical->>'interviewCount', '')::integer,
      concat_ws(E'\n', nullif(canonical->>'interviewScheduleText', ''),
        nullif(canonical->'commercial'->>'taxTreatment', '')),
      coalesce(nullif(canonical->>'startOn', '')::date, current_date), auth.uid(), auth.uid()
    );
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into output_ids
  from app.ai_execution_outputs where ai_execution_id = execution.id and tenant_id = tenant;
  update app.project_extraction_results set
    extraction_status = case when p_decision = 'approved' then 'applied' else 'rejected' end,
    extracted_data = canonical, reviewed_by = auth.uid(), reviewed_at = now(),
    applied_at = case when p_decision = 'approved' then now() else null end,
    review_notes = nullif(btrim(p_review_notes), ''),
    project_source_id = case when p_decision = 'approved' then source.id else project_source_id end
  where id = extraction.id;
  update app.ai_executions set status = 'succeeded' where id = execution.id;
  insert into app.ai_execution_reviews(
    tenant_id, ai_execution_id, reviewer_id, review_status, reviewed_at,
    review_comment, approved_output_ids, rejected_output_ids
  ) values (
    tenant, execution.id, auth.uid(), p_decision, now(), nullif(btrim(p_review_notes), ''),
    case when p_decision = 'approved' then output_ids else '{}'::uuid[] end,
    case when p_decision = 'rejected' then output_ids else '{}'::uuid[] end
  );
  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type,
    resource_id, request_id, metadata
  ) values (
    tenant, auth.uid(), 'user', 'project.extraction_' || p_decision,
    'project', p_project_id, nullif(p_request_id, ''),
    jsonb_build_object('extraction_id', extraction.id, 'ai_execution_id', execution.id,
      'project_source_id', case when p_decision = 'approved' then source.id else null end)
  );
  return public.get_project_extraction(p_project_id, extraction.id);
end
$$;

revoke all on function public.request_project_extraction(uuid,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.complete_project_extraction(uuid,uuid,jsonb,integer,integer) from public,anon,authenticated;
revoke all on function public.fail_project_extraction(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_project_extraction(uuid,uuid) from public,anon,authenticated;
revoke all on function public.review_project_extraction(uuid,uuid,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.request_project_extraction(uuid,text,text,text,text,text,text) to authenticated;
grant execute on function public.complete_project_extraction(uuid,uuid,jsonb,integer,integer) to authenticated;
grant execute on function public.fail_project_extraction(uuid,uuid,text,text) to authenticated;
grant execute on function public.get_project_extraction(uuid,uuid) to authenticated;
grant execute on function public.review_project_extraction(uuid,uuid,text,jsonb,text,text) to authenticated;

commit;
