-- SES Navigator
-- Migration: 154_ai_interview_summary_task_rpc
-- Purpose: Generate and review interview summaries, then create only explicitly approved task candidates.

begin;

create or replace function private.is_valid_timestamptz(
  p_value text
)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
begin
  perform p_value::timestamptz;
  return true;
exception when others then
  return false;
end
$$;

revoke all on function private.is_valid_timestamptz(text)
  from public, anon, authenticated;

create or replace function private.is_valid_interview_summary(
  p_result jsonb
)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
begin
  if jsonb_typeof(p_result) is distinct from 'object'
     or p_result - array['summary','facts','evaluations','concerns','actionItems',
       'openQuestions','statusSuggestions','safetyWarnings'] <> '{}'::jsonb
     or jsonb_typeof(p_result->'summary') is distinct from 'string'
     or nullif(btrim(p_result->>'summary'), '') is null
     or length(p_result->>'summary') > 10000
     or jsonb_typeof(p_result->'facts') is distinct from 'array'
     or jsonb_typeof(p_result->'evaluations') is distinct from 'array'
     or jsonb_typeof(p_result->'concerns') is distinct from 'array'
     or jsonb_typeof(p_result->'actionItems') is distinct from 'array'
     or jsonb_typeof(p_result->'openQuestions') is distinct from 'array'
     or jsonb_typeof(p_result->'statusSuggestions') is distinct from 'array'
     or jsonb_typeof(p_result->'safetyWarnings') is distinct from 'array'
  then
    return false;
  end if;

  if jsonb_array_length(p_result->'facts') > 100
     or jsonb_array_length(p_result->'evaluations') > 50
     or jsonb_array_length(p_result->'concerns') > 50
     or jsonb_array_length(p_result->'actionItems') > 50
     or jsonb_array_length(p_result->'openQuestions') > 100
     or jsonb_array_length(p_result->'statusSuggestions') > 20
     or jsonb_array_length(p_result->'safetyWarnings') > 50
  then
    return false;
  end if;

  if exists (
       select 1 from jsonb_array_elements(p_result->'facts') item
       where jsonb_typeof(item) is distinct from 'string'
         or nullif(btrim(item #>> '{}'), '') is null
         or length(item #>> '{}') > 2000
     )
     or exists (
       select 1 from jsonb_array_elements(p_result->'openQuestions') item
       where jsonb_typeof(item) is distinct from 'string'
         or nullif(btrim(item #>> '{}'), '') is null
         or length(item #>> '{}') > 2000
     )
     or exists (
       select 1 from jsonb_array_elements(p_result->'safetyWarnings') item
       where jsonb_typeof(item) is distinct from 'string'
         or nullif(btrim(item #>> '{}'), '') is null
         or length(item #>> '{}') > 2000
     )
     or exists (
       select 1 from jsonb_array_elements(p_result->'evaluations') item
       where jsonb_typeof(item) is distinct from 'object'
         or item - array['source','text','evidence'] <> '{}'::jsonb
         or jsonb_typeof(item->'source') is distinct from 'string'
         or nullif(btrim(item->>'source'), '') is null
         or length(item->>'source') > 200
         or jsonb_typeof(item->'text') is distinct from 'string'
         or nullif(btrim(item->>'text'), '') is null
         or length(item->>'text') > 2000
         or jsonb_typeof(item->'evidence') is distinct from 'string'
         or nullif(btrim(item->>'evidence'), '') is null
         or length(item->>'evidence') > 2000
     )
     or exists (
       select 1 from jsonb_array_elements(p_result->'concerns') item
       where jsonb_typeof(item) is distinct from 'object'
         or item - array['text','evidence','severity'] <> '{}'::jsonb
         or jsonb_typeof(item->'text') is distinct from 'string'
         or nullif(btrim(item->>'text'), '') is null
         or length(item->>'text') > 2000
         or jsonb_typeof(item->'evidence') is distinct from 'string'
         or nullif(btrim(item->>'evidence'), '') is null
         or length(item->>'evidence') > 2000
         or nullif(item->>'severity', '') is null
         or item->>'severity' not in ('low','medium','high')
     )
     or exists (
       select 1 from jsonb_array_elements(p_result->'actionItems') item
       where jsonb_typeof(item) is distinct from 'object'
         or item - array['title','description','dueAt','priority','evidence'] <> '{}'::jsonb
         or jsonb_typeof(item->'title') is distinct from 'string'
         or nullif(btrim(item->>'title'), '') is null
         or length(item->>'title') > 200
         or jsonb_typeof(item->'description') is distinct from 'string'
         or length(item->>'description') > 5000
         or (jsonb_typeof(item->'dueAt') is distinct from 'string'
           and jsonb_typeof(item->'dueAt') is distinct from 'null')
         or (jsonb_typeof(item->'dueAt') = 'string'
           and (item->>'dueAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]{1,6})?)?(Z|[+-][0-9]{2}:[0-9]{2})$'
             or not private.is_valid_timestamptz(item->>'dueAt')))
         or nullif(item->>'priority', '') is null
         or item->>'priority' not in ('low','normal','high','urgent')
         or jsonb_typeof(item->'evidence') is distinct from 'string'
         or nullif(btrim(item->>'evidence'), '') is null
         or length(item->>'evidence') > 2000
     )
     or exists (
       select 1 from jsonb_array_elements(p_result->'statusSuggestions') item
       where jsonb_typeof(item) is distinct from 'object'
         or item - array['status','reason','evidence'] <> '{}'::jsonb
         or nullif(item->>'status', '') is null
         or item->>'status' not in ('interviewing','offered','won','lost','withdrawn')
         or jsonb_typeof(item->'reason') is distinct from 'string'
         or nullif(btrim(item->>'reason'), '') is null
         or length(item->>'reason') > 2000
         or jsonb_typeof(item->'evidence') is distinct from 'string'
         or nullif(btrim(item->>'evidence'), '') is null
         or length(item->>'evidence') > 2000
     )
  then
    return false;
  end if;

  return true;
end
$$;

revoke all on function private.is_valid_interview_summary(jsonb)
  from public, anon, authenticated;

create or replace function private.interview_summary_json(
  p_ai_execution_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'ai_execution_id', execution.id,
    'interview_id', (execution.metadata->>'interview_id')::uuid,
    'proposal_id', (execution.metadata->>'proposal_id')::uuid,
    'interview_row_version', (execution.metadata->>'interview_row_version')::bigint,
    'status', execution.status,
    'provider', execution.provider,
    'model_name', execution.model_name,
    'prompt_version', execution.prompt_version,
    'error_code', execution.error_code,
    'error_message', execution.error_message,
    'result', selected_output.content_json,
    'original_result', original_output.content_json,
    'review_status', review.review_status,
    'review_comment', review.review_comment,
    'reviewed_at', review.reviewed_at,
    'review_row_version', review.row_version,
    'generated_task_ids', coalesce((
      select jsonb_agg(link.task_id order by link.created_at, link.task_id)
      from app.task_links link
      where link.tenant_id = execution.tenant_id
        and link.resource_type = 'ai_execution'
        and link.resource_id = execution.id
        and link.link_type = 'generated_from'
    ), '[]'::jsonb),
    'requested_at', execution.requested_at,
    'completed_at', execution.completed_at,
    'row_version', execution.row_version
  )
  from app.ai_executions execution
  left join lateral (
    select output.content_json
    from app.ai_execution_outputs output
    where output.tenant_id = execution.tenant_id
      and output.ai_execution_id = execution.id
      and output.output_type in ('interview_summary','interview_summary_edited')
    order by output.sequence_no desc
    limit 1
  ) selected_output on true
  left join lateral (
    select output.content_json
    from app.ai_execution_outputs output
    where output.tenant_id = execution.tenant_id
      and output.ai_execution_id = execution.id
      and output.output_type = 'interview_summary'
    order by output.sequence_no
    limit 1
  ) original_output on true
  left join lateral (
    select r.review_status, r.review_comment, r.reviewed_at, r.row_version
    from app.ai_execution_reviews r
    where r.tenant_id = execution.tenant_id
      and r.ai_execution_id = execution.id
    order by r.created_at desc
    limit 1
  ) review on true
  where execution.id = p_ai_execution_id
    and execution.execution_type = 'interview.summarize';
$$;

revoke all on function private.interview_summary_json(uuid)
  from public, anon, authenticated;

create or replace function public.start_interview_summary(
  p_interview_id uuid,
  p_additional_instructions text,
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
  target app.interviews%rowtype;
  proposal app.proposals%rowtype;
  execution app.ai_executions%rowtype;
  summary_input jsonb;
  instructions text := nullif(btrim(p_additional_instructions), '');
begin
  if auth.uid() is null or tenant is null or p_interview_id is null
     or not app.has_permission('ai.execute')
     or not app.has_permission('interview.manage')
     or nullif(btrim(p_provider), '') is null
     or nullif(btrim(p_model_name), '') is null
     or nullif(btrim(p_prompt_version), '') is null
     or length(coalesce(instructions, '')) > 2000
  then
    raise exception 'invalid interview summary request' using errcode = '22023';
  end if;

  select i.* into target
  from app.interviews i
  where i.id = p_interview_id and i.tenant_id = tenant
    and i.status = 'completed'
    and app.can_access_interview(i.id, 'interview.manage', 'edit');
  if not found then return null; end if;

  select p.* into proposal
  from app.proposals p
  where p.id = target.proposal_id and p.tenant_id = tenant
    and p.deleted_at is null
    and app.can_access_proposal(p.id, 'proposal.read', 'view');
  if not found then return null; end if;

  if nullif(btrim(target.notes), '') is null
     and not exists (
       select 1 from app.interview_feedback feedback
       where feedback.tenant_id = tenant and feedback.interview_id = target.id
         and (feedback.comments is not null or feedback.recommendation is not null
           or feedback.overall_rating is not null)
     )
     and not exists (
       select 1 from app.interview_outcomes outcome
       where outcome.tenant_id = tenant and outcome.interview_id = target.id
         and (outcome.reason is not null or outcome.next_action is not null)
     )
  then
    raise exception 'interview summary source is empty' using errcode = '22023';
  end if;

  if exists (
    select 1 from app.ai_executions running
    where running.tenant_id = tenant
      and running.execution_type = 'interview.summarize'
      and running.metadata->>'interview_id' = target.id::text
      and running.status in ('queued','running')
  ) then
    raise exception 'interview summary is already running' using errcode = '23505';
  end if;

  summary_input := jsonb_build_object(
    'interview', jsonb_build_object(
      'id', target.id,
      'round', target.interview_round,
      'type', target.interview_type,
      'status', target.status,
      'scheduledStartAt', target.scheduled_start_at,
      'scheduledEndAt', target.scheduled_end_at,
      'notes', target.notes,
      'rowVersion', target.row_version
    ),
    'proposal', jsonb_build_object(
      'id', proposal.id,
      'managementNo', proposal.management_no,
      'status', proposal.status
    ),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participantType', participant.participant_type,
        'displayName', participant.display_name,
        'roleLabel', participant.role_label,
        'attendanceStatus', participant.attendance_status
      ) order by participant.created_at, participant.id)
      from app.interview_participants participant
      where participant.tenant_id = tenant
        and participant.interview_id = target.id
    ), '[]'::jsonb),
    'feedback', coalesce((
      select jsonb_agg(jsonb_build_object(
        'evaluationType', feedback.evaluation_type,
        'overallRating', feedback.overall_rating,
        'technicalRating', feedback.technical_rating,
        'communicationRating', feedback.communication_rating,
        'recommendation', feedback.recommendation,
        'comments', feedback.comments,
        'submittedAt', feedback.submitted_at
      ) order by feedback.created_at, feedback.id)
      from app.interview_feedback feedback
      where feedback.tenant_id = tenant and feedback.interview_id = target.id
    ), '[]'::jsonb),
    'outcome', (
      select jsonb_build_object(
        'outcome', outcome.outcome,
        'decidedAt', outcome.decided_at,
        'decisionSource', outcome.decision_source,
        'reason', outcome.reason,
        'nextAction', outcome.next_action,
        'nextActionDueAt', outcome.next_action_due_at
      )
      from app.interview_outcomes outcome
      where outcome.tenant_id = tenant and outcome.interview_id = target.id
      limit 1
    ),
    'settings', jsonb_build_object('additionalInstructions', instructions)
  );

  insert into app.ai_executions(
    tenant_id, execution_type, provider, model_name, prompt_version,
    status, requested_by, started_at, metadata
  ) values (
    tenant, 'interview.summarize', btrim(p_provider), btrim(p_model_name),
    btrim(p_prompt_version), 'running', auth.uid(), now(),
    jsonb_build_object('interview_id', target.id, 'proposal_id', proposal.id,
      'interview_row_version', target.row_version)
  ) returning * into execution;

  insert into app.ai_execution_inputs(
    tenant_id, ai_execution_id, input_type, content_json,
    source_resource_type, source_resource_id, content_hash
  ) values (
    tenant, execution.id, 'interview_summary_context', summary_input,
    'interview', target.id,
    encode(public.digest(convert_to(summary_input::text, 'UTF8'), 'sha256'), 'hex')
  );

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'interview_summary.generation_started',
    'interview', target.id, nullif(p_request_id, ''),
    jsonb_build_object('ai_execution_id', execution.id, 'status', execution.status),
    jsonb_build_object('proposal_id', proposal.id,
      'interview_row_version', target.row_version)
  );

  return jsonb_build_object(
    'summary', private.interview_summary_json(execution.id),
    'summary_input', summary_input
  );
end
$$;

create or replace function public.complete_interview_summary(
  p_interview_id uuid,
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
  execution app.ai_executions%rowtype;
begin
  if auth.uid() is null or tenant is null or p_interview_id is null
     or p_ai_execution_id is null or not app.has_permission('ai.execute')
     or not private.is_valid_interview_summary(p_result)
     or p_input_tokens < 0 or p_output_tokens < 0
  then
    raise exception 'invalid interview summary result' using errcode = '22023';
  end if;

  select a.* into execution
  from app.ai_executions a
  where a.id = p_ai_execution_id and a.tenant_id = tenant
    and a.execution_type = 'interview.summarize'
    and a.requested_by = auth.uid() and a.status = 'running'
    and a.metadata->>'interview_id' = p_interview_id::text
    and app.can_access_interview(p_interview_id, 'interview.manage', 'edit')
  for update;
  if not found then
    raise exception 'interview summary is not completable' using errcode = '42501';
  end if;

  insert into app.ai_execution_outputs(
    tenant_id, ai_execution_id, output_type, sequence_no, content_json,
    schema_version, content_hash
  ) values (
    tenant, execution.id, 'interview_summary', 1, p_result,
    'interview.summarize.v1',
    encode(public.digest(convert_to(p_result::text, 'UTF8'), 'sha256'), 'hex')
  );

  update app.ai_executions set
    status = 'review_required', completed_at = now(),
    input_tokens = p_input_tokens, output_tokens = p_output_tokens,
    error_code = null, error_message = null
  where id = execution.id and tenant_id = tenant;

  insert into app.ai_execution_reviews(
    tenant_id, ai_execution_id, reviewer_id, review_status
  ) values (tenant, execution.id, null, 'pending');

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'interview_summary.generated',
    'interview', p_interview_id, nullif(p_request_id, ''),
    jsonb_build_object('ai_execution_id', execution.id,
      'status', 'review_required'),
    jsonb_build_object('action_item_count', jsonb_array_length(p_result->'actionItems'),
      'status_suggestion_count', jsonb_array_length(p_result->'statusSuggestions'))
  );

  return private.interview_summary_json(execution.id);
end
$$;

create or replace function public.fail_interview_summary(
  p_interview_id uuid,
  p_ai_execution_id uuid,
  p_error_code text,
  p_error_message text,
  p_request_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
begin
  if auth.uid() is null or tenant is null or not app.has_permission('ai.execute') then
    raise exception 'interview summary failure is not permitted' using errcode = '42501';
  end if;

  update app.ai_executions execution set
    status = 'failed', completed_at = now(),
    error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'ai_error'), 100),
    error_message = left(coalesce(nullif(btrim(p_error_message), ''),
      'Interview summary generation failed'), 2000)
  where execution.id = p_ai_execution_id and execution.tenant_id = tenant
    and execution.execution_type = 'interview.summarize'
    and execution.requested_by = auth.uid() and execution.status = 'running'
    and execution.metadata->>'interview_id' = p_interview_id::text
    and app.can_access_interview(p_interview_id, 'interview.manage', 'edit');
  if not found then return false; end if;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'interview_summary.generation_failed',
    'interview', p_interview_id, nullif(p_request_id, ''),
    jsonb_build_object('ai_execution_id', p_ai_execution_id, 'status', 'failed'),
    jsonb_build_object('error_code', left(coalesce(p_error_code, 'ai_error'), 100))
  );
  return true;
end
$$;

create or replace function public.review_interview_summary(
  p_interview_id uuid,
  p_ai_execution_id uuid,
  p_review_row_version bigint,
  p_decision text,
  p_edited_result jsonb,
  p_accepted_action_item_indexes integer[],
  p_review_comment text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  decision text := lower(btrim(coalesce(p_decision, '')));
  comment_text text := nullif(btrim(p_review_comment), '');
  accepted_indexes integer[] := coalesce(p_accepted_action_item_indexes, '{}'::integer[]);
  execution app.ai_executions%rowtype;
  review app.ai_execution_reviews%rowtype;
  original_output app.ai_execution_outputs%rowtype;
  selected_output app.ai_execution_outputs%rowtype;
  selected_result jsonb;
  action_index integer;
  action_item jsonb;
  created_task_id uuid;
  generated_task_ids uuid[] := '{}'::uuid[];
  task_was_created boolean;
begin
  if auth.uid() is null or tenant is null or p_interview_id is null
     or p_ai_execution_id is null or p_review_row_version is null
     or p_review_row_version < 1 or decision not in ('approve','reject')
     or not app.has_permission('ai.review')
     or not app.has_permission('interview.manage')
     or length(coalesce(comment_text, '')) > 2000
     or (decision = 'reject' and comment_text is null)
     or cardinality(accepted_indexes) > 50
     or (decision = 'reject' and cardinality(accepted_indexes) > 0)
     or (decision = 'reject' and p_edited_result is not null)
     or (p_edited_result is not null
       and not private.is_valid_interview_summary(p_edited_result))
  then
    raise exception 'invalid interview summary review request' using errcode = '22023';
  end if;

  if cardinality(accepted_indexes) > 0 and not app.has_permission('task.manage') then
    raise exception 'task candidate acceptance is not permitted' using errcode = '42501';
  end if;

  select a.* into execution
  from app.ai_executions a
  where a.id = p_ai_execution_id and a.tenant_id = tenant
    and a.execution_type = 'interview.summarize'
    and a.status = 'review_required'
    and a.metadata->>'interview_id' = p_interview_id::text
    and app.can_access_interview(p_interview_id, 'interview.manage', 'edit')
  for update;
  if not found then return null; end if;

  select r.* into review
  from app.ai_execution_reviews r
  where r.tenant_id = tenant and r.ai_execution_id = execution.id
    and r.review_status = 'pending'
  order by r.created_at desc
  limit 1
  for update;
  if not found or review.row_version <> p_review_row_version then return null; end if;

  select output.* into original_output
  from app.ai_execution_outputs output
  where output.tenant_id = tenant and output.ai_execution_id = execution.id
    and output.output_type = 'interview_summary' and output.sequence_no = 1;
  if not found then return null; end if;

  selected_result := coalesce(p_edited_result, original_output.content_json);
  if cardinality(accepted_indexes) <> (
    select count(distinct value)::integer from unnest(accepted_indexes) value
  ) or exists (
    select 1 from unnest(accepted_indexes) value
    where value < 1 or value > jsonb_array_length(selected_result->'actionItems')
  ) then
    raise exception 'accepted action item indexes are invalid' using errcode = '22023';
  end if;

  if p_edited_result is not null then
    insert into app.ai_execution_outputs(
      tenant_id, ai_execution_id, output_type, sequence_no, content_json,
      schema_version, content_hash
    ) values (
      tenant, execution.id, 'interview_summary_edited', 2, p_edited_result,
      'interview.summarize.v1',
      encode(public.digest(convert_to(p_edited_result::text, 'UTF8'), 'sha256'), 'hex')
    ) returning * into selected_output;
  else
    selected_output := original_output;
  end if;

  if decision = 'approve' then
    foreach action_index in array accepted_indexes loop
      action_item := selected_result->'actionItems'->(action_index - 1);
      task_was_created := false;
      insert into app.tasks(
        tenant_id, title, description, status, priority, due_at,
        deduplication_key, created_by, updated_by
      ) values (
        tenant, btrim(action_item->>'title'), nullif(action_item->>'description', ''),
        'open', action_item->>'priority',
        case when jsonb_typeof(action_item->'dueAt') = 'string'
          then (action_item->>'dueAt')::timestamptz else null end,
        'interview-summary:' || execution.id::text || ':action:' || action_index::text,
        auth.uid(), auth.uid()
      )
      on conflict (tenant_id, deduplication_key) do nothing
      returning id into created_task_id;

      if created_task_id is not null then
        task_was_created := true;
      else
        select task.id into created_task_id
        from app.tasks task
        where task.tenant_id = tenant
          and task.deduplication_key =
            'interview-summary:' || execution.id::text || ':action:' || action_index::text;
      end if;

      insert into app.task_links(
        tenant_id, task_id, resource_type, resource_id, link_type, created_by
      ) values
        (tenant, created_task_id, 'interview', p_interview_id, 'related', auth.uid()),
        (tenant, created_task_id, 'ai_execution', execution.id, 'generated_from', auth.uid())
      on conflict (tenant_id, task_id, resource_type, resource_id, link_type) do nothing;

      insert into app.task_assignments(
        tenant_id, task_id, assignee_user_id, assignment_type, assigned_by
      ) values (tenant, created_task_id, auth.uid(), 'owner', auth.uid())
      on conflict (tenant_id, task_id, assignee_user_id, assignment_type) do nothing;

      if task_was_created then
        insert into audit.task_status_histories(
          tenant_id, task_id, from_status, to_status, reason, changed_by, source
        ) values (
          tenant, created_task_id, null, 'open',
          'Approved AI interview summary action item', auth.uid(), 'ai'
        );
      end if;
      generated_task_ids := array_append(generated_task_ids, created_task_id);
      created_task_id := null;
    end loop;
  end if;

  update app.ai_execution_reviews set
    reviewer_id = auth.uid(),
    review_status = case
      when decision = 'reject' then 'rejected'
      when p_edited_result is not null then 'partially_approved'
      else 'approved'
    end,
    reviewed_at = now(), review_comment = comment_text,
    approved_output_ids = case when decision = 'approve'
      then array[selected_output.id] else '{}'::uuid[] end,
    rejected_output_ids = case when decision = 'reject'
      then array[original_output.id] else '{}'::uuid[] end
  where id = review.id and tenant_id = tenant;

  update app.ai_executions set status = 'succeeded'
  where id = execution.id and tenant_id = tenant and status = 'review_required';

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user',
    case decision when 'approve' then 'interview_summary.approved'
      else 'interview_summary.rejected' end,
    'interview', p_interview_id, nullif(p_request_id, ''),
    jsonb_build_object('review_status', review.review_status,
      'review_row_version', review.row_version),
    jsonb_build_object('review_status', case
      when decision = 'reject' then 'rejected'
      when p_edited_result is not null then 'partially_approved'
      else 'approved' end,
      'generated_task_ids', to_jsonb(generated_task_ids)),
    jsonb_build_object('ai_execution_id', execution.id,
      'accepted_action_item_indexes', to_jsonb(accepted_indexes),
      'proposal_status_changed', false)
  );

  return private.interview_summary_json(execution.id);
end
$$;

create or replace function public.get_interview_summary(
  p_interview_id uuid,
  p_ai_execution_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  execution_id uuid;
begin
  if auth.uid() is null or tenant is null or p_interview_id is null
     or not app.can_access_interview(p_interview_id, 'interview.read', 'view')
     or not (app.has_permission('ai.read') or app.has_permission('ai.review')
       or app.has_permission('ai.execute'))
  then
    raise exception 'interview summary read is not permitted' using errcode = '42501';
  end if;

  select execution.id into execution_id
  from app.ai_executions execution
  where execution.tenant_id = tenant
    and execution.execution_type = 'interview.summarize'
    and execution.metadata->>'interview_id' = p_interview_id::text
    and (p_ai_execution_id is null or execution.id = p_ai_execution_id)
    and (execution.requested_by = auth.uid() or app.has_permission('ai.read')
      or app.has_permission('ai.review'))
  order by execution.requested_at desc, execution.id desc
  limit 1;

  return case when execution_id is null then null
    else private.interview_summary_json(execution_id) end;
end
$$;

revoke all on function public.start_interview_summary(uuid, text, text, text, text, text)
  from public, anon;
revoke all on function public.complete_interview_summary(uuid, uuid, jsonb, integer, integer, text)
  from public, anon;
revoke all on function public.fail_interview_summary(uuid, uuid, text, text, text)
  from public, anon;
revoke all on function public.review_interview_summary(uuid, uuid, bigint, text, jsonb, integer[], text, text)
  from public, anon;
revoke all on function public.get_interview_summary(uuid, uuid)
  from public, anon;

grant execute on function public.start_interview_summary(uuid, text, text, text, text, text)
  to authenticated;
grant execute on function public.complete_interview_summary(uuid, uuid, jsonb, integer, integer, text)
  to authenticated;
grant execute on function public.fail_interview_summary(uuid, uuid, text, text, text)
  to authenticated;
grant execute on function public.review_interview_summary(uuid, uuid, bigint, text, jsonb, integer[], text, text)
  to authenticated;
grant execute on function public.get_interview_summary(uuid, uuid)
  to authenticated;

comment on function public.start_interview_summary(uuid, text, text, text, text, text) is
  'Starts an audited interview.summarize execution from a fixed completed-interview snapshot.';
comment on function public.review_interview_summary(uuid, uuid, bigint, text, jsonb, integer[], text, text) is
  'Reviews an immutable interview summary and creates only explicitly selected task candidates; proposal status is never changed.';

commit;
