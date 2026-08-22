-- SES Navigator
-- Migration: 150_resume_extraction_review_rpc
-- Purpose: Manage AI resume extraction requests, results, failures, and human review.

begin;

alter table app.resume_extraction_results
  add column ai_execution_id uuid;

alter table app.resume_extraction_results
  add constraint resume_extraction_results_ai_execution_fk
  foreign key (tenant_id, ai_execution_id)
  references app.ai_executions(tenant_id, id)
  on delete set null (ai_execution_id);

create unique index resume_extraction_results_ai_execution_idx
  on app.resume_extraction_results(tenant_id, ai_execution_id)
  where ai_execution_id is not null;

create or replace function public.request_resume_extraction(
  p_engineer_id uuid,
  p_resume_version_id uuid,
  p_source_text text,
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
  extraction app.resume_extraction_results%rowtype;
begin
  if auth.uid() is null or tenant is null
     or p_engineer_id is null or p_resume_version_id is null
     or char_length(btrim(coalesce(p_source_text, ''))) not between 50 and 100000
     or nullif(btrim(p_provider), '') is null
     or nullif(btrim(p_model_name), '') is null
     or nullif(btrim(p_prompt_version), '') is null
     or not app.has_permission('ai.execute')
     or not app.can_access_engineer(p_engineer_id, 'engineer.manage', 'edit')
     or not exists (
       select 1
       from app.engineer_resume_versions v
       join app.engineer_resumes r on r.id = v.resume_id and r.tenant_id = v.tenant_id
       where v.id = p_resume_version_id and v.tenant_id = tenant
         and r.engineer_id = p_engineer_id and r.deleted_at is null
     )
  then
    raise exception 'resume extraction is not executable' using errcode = '42501';
  end if;

  if exists (
    select 1 from app.resume_extraction_results x
    where x.tenant_id = tenant and x.resume_version_id = p_resume_version_id
      and x.extraction_status in ('pending', 'processing')
  ) then
    raise exception 'resume extraction is already running' using errcode = '23505';
  end if;

  insert into app.ai_executions(
    tenant_id, execution_type, provider, model_name, prompt_version,
    status, requested_by, started_at, metadata
  ) values (
    tenant, 'resume.extract', btrim(p_provider), btrim(p_model_name),
    btrim(p_prompt_version), 'running', auth.uid(), now(),
    jsonb_build_object('engineer_id', p_engineer_id, 'resume_version_id', p_resume_version_id)
  ) returning * into execution;

  insert into app.ai_execution_inputs(
    tenant_id, ai_execution_id, input_type, content_text,
    source_resource_type, source_resource_id, content_hash
  ) values (
    tenant, execution.id, 'resume_text', p_source_text,
    'engineer_resume_version', p_resume_version_id,
    encode(public.digest(convert_to(p_source_text, 'UTF8'), 'sha256'), 'hex')
  );

  update app.engineer_resume_versions
  set extracted_text = p_source_text
  where id = p_resume_version_id and tenant_id = tenant;

  insert into app.resume_extraction_results(
    tenant_id, resume_version_id, ai_execution_id, extraction_status, model_provider,
    model_name, prompt_version, created_by
  ) values (
    tenant, p_resume_version_id, execution.id, 'processing', btrim(p_provider),
    btrim(p_model_name), btrim(p_prompt_version), auth.uid()
  ) returning * into extraction;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type,
    resource_id, request_id, metadata
  ) values (
    tenant, auth.uid(), 'user', 'engineer.resume_extraction_requested',
    'engineer', p_engineer_id, nullif(p_request_id, ''),
    jsonb_build_object('resume_version_id', p_resume_version_id,
      'extraction_id', extraction.id, 'ai_execution_id', execution.id)
  );

  return jsonb_build_object(
    'extraction_id', extraction.id,
    'ai_execution_id', execution.id,
    'status', extraction.extraction_status
  );
end
$$;

create or replace function public.complete_resume_extraction(
  p_extraction_id uuid,
  p_ai_execution_id uuid,
  p_result jsonb,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  extraction app.resume_extraction_results%rowtype;
  output app.ai_execution_outputs%rowtype;
begin
  if auth.uid() is null or tenant is null
     or jsonb_typeof(p_result) is distinct from 'object'
     or jsonb_typeof(p_result->'profile') is distinct from 'object'
     or jsonb_typeof(p_result->'careerHistories') is distinct from 'array'
     or jsonb_typeof(p_result->'skills') is distinct from 'array'
     or jsonb_typeof(p_result->'qualifications') is distinct from 'array'
     or jsonb_typeof(p_result->'preferences') is distinct from 'object'
     or jsonb_typeof(p_result->'uncertainties') is distinct from 'array'
     or jsonb_typeof(p_result->'confidenceScore') is distinct from 'number'
     or (p_result->>'confidenceScore')::numeric not between 0 and 1
     or not app.has_permission('ai.execute')
  then
    raise exception 'resume extraction result is invalid' using errcode = '22023';
  end if;

  select x.* into extraction
  from app.resume_extraction_results x
  join app.ai_executions a
    on a.id = p_ai_execution_id and a.tenant_id = x.tenant_id
  where x.id = p_extraction_id and x.tenant_id = tenant
    and x.extraction_status = 'processing'
    and a.requested_by = auth.uid() and a.status = 'running'
    and (a.metadata->>'resume_version_id')::uuid = x.resume_version_id
  for update of x;
  if not found then
    raise exception 'resume extraction is not completable' using errcode = '42501';
  end if;

  update app.resume_extraction_results set
    extraction_status = 'completed',
    extracted_profile = jsonb_build_object(
      'profile', p_result->'profile',
      'qualifications', p_result->'qualifications',
      'preferences', p_result->'preferences',
      'uncertainties', p_result->'uncertainties'
    ),
    extracted_career_histories = p_result->'careerHistories',
    extracted_skills = p_result->'skills',
    confidence_score = (p_result->>'confidenceScore')::numeric,
    error_message = null
  where id = extraction.id
  returning * into extraction;

  insert into app.ai_execution_outputs(
    tenant_id, ai_execution_id, output_type, content_json,
    confidence_score, schema_version
  ) values (
    tenant, p_ai_execution_id, 'resume_extraction', p_result,
    extraction.confidence_score, 'resume.extract.v1'
  ) returning * into output;

  update app.ai_executions set
    status = 'review_required', completed_at = now(),
    input_tokens = p_input_tokens, output_tokens = p_output_tokens
  where id = p_ai_execution_id and tenant_id = tenant;

  return jsonb_build_object(
    'extraction_id', extraction.id,
    'ai_execution_id', p_ai_execution_id,
    'output_id', output.id,
    'status', extraction.extraction_status
  );
end
$$;

create or replace function public.fail_resume_extraction(
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
    raise exception 'resume extraction is not fail-able' using errcode = '42501';
  end if;
  update app.resume_extraction_results x set
    extraction_status = 'failed', error_message = left(coalesce(p_error_message, 'AI extraction failed'), 2000)
  from app.ai_executions a
  where x.id = p_extraction_id and x.tenant_id = tenant
    and a.id = p_ai_execution_id and a.tenant_id = tenant
    and a.requested_by = auth.uid() and x.extraction_status = 'processing';
  if not found then return false; end if;
  update app.ai_executions set status = 'failed', completed_at = now(),
    error_code = left(coalesce(p_error_code, 'ai_error'), 100),
    error_message = left(coalesce(p_error_message, 'AI extraction failed'), 2000)
  where id = p_ai_execution_id and tenant_id = tenant;
  return true;
end
$$;

create or replace function public.get_resume_extraction(
  p_engineer_id uuid,
  p_resume_version_id uuid,
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
     or not app.can_access_engineer(p_engineer_id, 'engineer.read', 'view')
     or not (app.has_permission('ai.read') or app.has_permission('ai.review'))
  then
    raise exception 'resume extraction is not accessible' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', x.id, 'resume_version_id', x.resume_version_id,
    'ai_execution_id', a.id, 'status', x.extraction_status,
    'provider', x.model_provider, 'model_name', x.model_name,
    'prompt_version', x.prompt_version,
    'result', case when x.extraction_status in ('completed','approved','rejected') then
      jsonb_build_object(
        'profile', coalesce(x.extracted_profile->'profile', '{}'::jsonb),
        'careerHistories', x.extracted_career_histories,
        'skills', x.extracted_skills,
        'qualifications', coalesce(x.extracted_profile->'qualifications', '[]'::jsonb),
        'preferences', coalesce(x.extracted_profile->'preferences', '{}'::jsonb),
        'uncertainties', coalesce(x.extracted_profile->'uncertainties', '[]'::jsonb),
        'confidenceScore', x.confidence_score
      ) else null end,
    'error_message', x.error_message,
    'review_notes', x.review_notes,
    'reviewed_at', x.reviewed_at,
    'created_at', x.created_at
  ) into result
  from app.resume_extraction_results x
  join app.engineer_resume_versions v on v.id = x.resume_version_id and v.tenant_id = x.tenant_id
  join app.engineer_resumes r on r.id = v.resume_id and r.tenant_id = v.tenant_id
  left join app.ai_executions a on a.tenant_id = x.tenant_id
    and a.id = x.ai_execution_id
  where r.engineer_id = p_engineer_id
    and x.resume_version_id = p_resume_version_id
    and (p_extraction_id is null or x.id = p_extraction_id)
    and (a.requested_by = auth.uid() or app.has_permission('ai.read', null) or app.has_permission('ai.review', null))
  order by x.created_at desc
  limit 1;
  return result;
end
$$;

create or replace function public.review_resume_extraction(
  p_engineer_id uuid,
  p_resume_version_id uuid,
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
  extraction app.resume_extraction_results%rowtype;
  execution app.ai_executions%rowtype;
  canonical jsonb;
  output_ids uuid[];
begin
  if auth.uid() is null or tenant is null
     or p_decision not in ('approved', 'rejected')
     or char_length(coalesce(p_review_notes, '')) > 2000
     or not app.has_permission('ai.review')
     or not app.can_access_engineer(p_engineer_id, 'engineer.manage', 'edit')
     or (p_corrected_result is not null and (
       jsonb_typeof(p_corrected_result) is distinct from 'object'
       or jsonb_typeof(p_corrected_result->'profile') is distinct from 'object'
       or jsonb_typeof(p_corrected_result->'careerHistories') is distinct from 'array'
       or jsonb_typeof(p_corrected_result->'skills') is distinct from 'array'
       or jsonb_typeof(p_corrected_result->'qualifications') is distinct from 'array'
       or jsonb_typeof(p_corrected_result->'preferences') is distinct from 'object'
       or jsonb_typeof(p_corrected_result->'uncertainties') is distinct from 'array'
       or jsonb_typeof(p_corrected_result->'confidenceScore') is distinct from 'number'
       or (p_corrected_result->>'confidenceScore')::numeric not between 0 and 1
     ))
  then
    raise exception 'resume extraction review is invalid' using errcode = '42501';
  end if;

  select x.* into extraction
  from app.resume_extraction_results x
  join app.engineer_resume_versions v on v.id = x.resume_version_id and v.tenant_id = x.tenant_id
  join app.engineer_resumes r on r.id = v.resume_id and r.tenant_id = v.tenant_id
  join app.ai_executions a on a.tenant_id = x.tenant_id
    and a.id = x.ai_execution_id
  where x.id = p_extraction_id and x.tenant_id = tenant
    and x.resume_version_id = p_resume_version_id
    and r.engineer_id = p_engineer_id and x.extraction_status = 'completed'
  for update of x;
  if not found then
    raise exception 'resume extraction is not reviewable' using errcode = '42501';
  end if;

  select a.* into execution
  from app.ai_executions a
  where a.id = extraction.ai_execution_id and a.tenant_id = tenant;

  canonical := coalesce(p_corrected_result, jsonb_build_object(
    'profile', coalesce(extraction.extracted_profile->'profile', '{}'::jsonb),
    'careerHistories', extraction.extracted_career_histories,
    'skills', extraction.extracted_skills,
    'qualifications', coalesce(extraction.extracted_profile->'qualifications', '[]'::jsonb),
    'preferences', coalesce(extraction.extracted_profile->'preferences', '{}'::jsonb),
    'uncertainties', coalesce(extraction.extracted_profile->'uncertainties', '[]'::jsonb),
    'confidenceScore', extraction.confidence_score
  ));
  select coalesce(array_agg(id), '{}'::uuid[]) into output_ids
  from app.ai_execution_outputs where ai_execution_id = execution.id and tenant_id = tenant;

  update app.resume_extraction_results set
    extraction_status = p_decision, reviewed_at = now(), reviewed_by = auth.uid(),
    review_notes = nullif(btrim(p_review_notes), '')
  where id = extraction.id;
  if p_decision = 'approved' then
    update app.engineer_resume_versions set structured_data = canonical
    where id = extraction.resume_version_id and tenant_id = tenant;
  end if;
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
    tenant, auth.uid(), 'user', 'engineer.resume_extraction_' || p_decision,
    'engineer', p_engineer_id, nullif(p_request_id, ''),
    jsonb_build_object('resume_version_id', extraction.resume_version_id,
      'extraction_id', extraction.id, 'ai_execution_id', execution.id)
  );
  return public.get_resume_extraction(p_engineer_id, extraction.resume_version_id, extraction.id);
end
$$;

revoke all on function public.request_resume_extraction(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.complete_resume_extraction(uuid,uuid,jsonb,integer,integer,text) from public,anon,authenticated;
revoke all on function public.fail_resume_extraction(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_resume_extraction(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.review_resume_extraction(uuid,uuid,uuid,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.request_resume_extraction(uuid,uuid,text,text,text,text,text) to authenticated;
grant execute on function public.complete_resume_extraction(uuid,uuid,jsonb,integer,integer,text) to authenticated;
grant execute on function public.fail_resume_extraction(uuid,uuid,text,text) to authenticated;
grant execute on function public.get_resume_extraction(uuid,uuid,uuid) to authenticated;
grant execute on function public.review_resume_extraction(uuid,uuid,uuid,text,jsonb,text,text) to authenticated;

commit;
