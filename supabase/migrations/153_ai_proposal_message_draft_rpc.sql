-- SES Navigator
-- Migration: 153_ai_proposal_message_draft_rpc
-- Purpose: Generate, version, edit, and review AI-assisted proposal message drafts without sending them.

begin;

alter table app.outbound_messages
  add column ai_execution_id uuid,
  add column message_template_id uuid,
  add column current_version_id uuid,
  add column approved_version_id uuid,
  add column approved_at timestamptz,
  add column approved_by uuid references auth.users(id) on delete set null;

alter table app.outbound_messages
  add constraint outbound_messages_ai_execution_fk
    foreign key (tenant_id, ai_execution_id)
    references app.ai_executions(tenant_id, id)
    on delete set null (ai_execution_id),
  add constraint outbound_messages_template_fk
    foreign key (tenant_id, message_template_id)
    references app.message_templates(tenant_id, id)
    on delete set null (message_template_id),
  add constraint outbound_messages_current_version_fk
    foreign key (tenant_id, current_version_id)
    references app.outbound_message_versions(tenant_id, id)
    on delete set null (current_version_id),
  add constraint outbound_messages_approved_version_fk
    foreign key (tenant_id, approved_version_id)
    references app.outbound_message_versions(tenant_id, id)
    on delete set null (approved_version_id),
  add constraint outbound_messages_approval_state_check check (
    ai_execution_id is null
    or (status in ('approved','queued','sent')
      and approved_version_id is not null and approved_at is not null)
    or (status not in ('approved','queued','sent')
      and approved_version_id is null and approved_at is null)
  );

create unique index outbound_messages_ai_execution_idx
  on app.outbound_messages(tenant_id, ai_execution_id)
  where ai_execution_id is not null;
create index outbound_messages_template_id_fk_idx
  on app.outbound_messages(tenant_id, message_template_id)
  where message_template_id is not null;
create index outbound_messages_current_version_id_fk_idx
  on app.outbound_messages(tenant_id, current_version_id)
  where current_version_id is not null;
create index outbound_messages_approved_version_id_fk_idx
  on app.outbound_messages(tenant_id, approved_version_id)
  where approved_version_id is not null;

create or replace function private.safe_resume_composition_json(
  p_value jsonb
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'summary', p_value #> '{profile,summary}',
      'nearestStation', p_value #> '{profile,nearestStation}',
      'availableFrom', p_value #> '{profile,availableFrom}'
    ),
    'careerHistories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'projectName', entry.value->'projectName',
        'roleName', entry.value->'roleName',
        'industry', entry.value->'industry',
        'overview', entry.value->'overview',
        'responsibilities', entry.value->'responsibilities',
        'achievements', entry.value->'achievements',
        'startedOn', entry.value->'startedOn',
        'endedOn', entry.value->'endedOn'
      ) order by entry.ordinality)
      from jsonb_array_elements(case
        when jsonb_typeof(p_value->'careerHistories') = 'array'
          then p_value->'careerHistories' else '[]'::jsonb end)
        with ordinality entry(value, ordinality)
    ), '[]'::jsonb),
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', entry.value->'name',
        'experienceMonths', entry.value->'experienceMonths',
        'proficiencyLevel', entry.value->'proficiencyLevel',
        'lastUsedOn', entry.value->'lastUsedOn'
      ) order by entry.ordinality)
      from jsonb_array_elements(case
        when jsonb_typeof(p_value->'skills') = 'array'
          then p_value->'skills' else '[]'::jsonb end)
        with ordinality entry(value, ordinality)
    ), '[]'::jsonb),
    'qualifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', entry.value->'name',
        'issuer', entry.value->'issuer',
        'acquiredOn', entry.value->'acquiredOn',
        'expiresOn', entry.value->'expiresOn'
      ) order by entry.ordinality)
      from jsonb_array_elements(case
        when jsonb_typeof(p_value->'qualifications') = 'array'
          then p_value->'qualifications' else '[]'::jsonb end)
        with ordinality entry(value, ordinality)
    ), '[]'::jsonb)
  );
$$;

revoke all on function private.safe_resume_composition_json(jsonb)
  from public, anon, authenticated;

create or replace function private.proposal_message_draft_json(
  p_message_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'id', m.id,
    'proposal_id', m.proposal_id,
    'project_id', m.project_id,
    'engineer_id', m.engineer_id,
    'channel', m.channel,
    'status', m.status,
    'subject', m.subject,
    'body_text', m.body_text,
    'message_template_id', m.message_template_id,
    'current_version_id', m.current_version_id,
    'current_version_no', current_version.version_no,
    'current_generation_source', current_version.generation_source,
    'approved_version_id', m.approved_version_id,
    'approved_at', m.approved_at,
    'ai_execution_id', m.ai_execution_id,
    'ai_status', execution.status,
    'ai_error_code', execution.error_code,
    'ai_error_message', execution.error_message,
    'prompt_version', execution.prompt_version,
    'model_provider', execution.provider,
    'model_name', execution.model_name,
    'review_status', review.review_status,
    'review_comment', review.review_comment,
    'generation', output.content_json,
    'recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', recipient.recipient_type,
        'name', recipient.recipient_name,
        'address', recipient.recipient_address
      ) order by recipient.recipient_type, recipient.recipient_address)
      from app.outbound_message_recipients recipient
      where recipient.tenant_id = m.tenant_id
        and recipient.outbound_message_id = m.id
    ), '[]'::jsonb),
    'created_at', m.created_at,
    'updated_at', m.updated_at,
    'row_version', m.row_version
  )
  from app.outbound_messages m
  left join app.outbound_message_versions current_version
    on current_version.tenant_id = m.tenant_id
   and current_version.id = m.current_version_id
  left join app.ai_executions execution
    on execution.tenant_id = m.tenant_id
   and execution.id = m.ai_execution_id
  left join lateral (
    select r.review_status, r.review_comment
    from app.ai_execution_reviews r
    where r.tenant_id = m.tenant_id
      and r.ai_execution_id = m.ai_execution_id
    order by r.created_at desc
    limit 1
  ) review on true
  left join lateral (
    select o.content_json
    from app.ai_execution_outputs o
    where o.tenant_id = m.tenant_id
      and o.ai_execution_id = m.ai_execution_id
      and o.output_type = 'proposal_message_draft'
    order by o.sequence_no desc
    limit 1
  ) output on true
  where m.id = p_message_id;
$$;

revoke all on function private.proposal_message_draft_json(uuid)
  from public, anon, authenticated;

create or replace function public.start_proposal_message_draft(
  p_proposal_id uuid,
  p_message_template_id uuid,
  p_tone text,
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
  proposal app.proposals%rowtype;
  position app.project_positions%rowtype;
  project app.projects%rowtype;
  engineer app.engineers%rowtype;
  contact app.company_contacts%rowtype;
  company app.companies%rowtype;
  requirement app.project_requirement_versions%rowtype;
  resume_version app.engineer_resume_versions%rowtype;
  template app.message_templates%rowtype;
  execution app.ai_executions%rowtype;
  message app.outbound_messages%rowtype;
  composition_input jsonb;
  v_tone text := lower(btrim(coalesce(p_tone, 'standard')));
  v_instructions text := nullif(btrim(p_additional_instructions), '');
begin
  if auth.uid() is null or tenant is null or p_proposal_id is null
     or not app.has_permission('ai.execute')
     or not app.has_permission('message.manage')
     or v_tone not in ('formal','standard','concise')
     or length(coalesce(v_instructions, '')) > 2000
     or nullif(btrim(p_provider), '') is null
     or nullif(btrim(p_model_name), '') is null
     or nullif(btrim(p_prompt_version), '') is null
  then
    raise exception 'invalid proposal message generation request' using errcode = '22023';
  end if;

  select p.* into proposal
  from app.proposals p
  where p.id = p_proposal_id and p.tenant_id = tenant
    and p.deleted_at is null
    and p.status in ('draft','pending_approval','approved')
    and app.can_access_proposal(p.id, 'proposal.read', 'view');
  if not found then return null; end if;

  select pp.* into position
  from app.project_positions pp
  where pp.id = proposal.project_position_id and pp.tenant_id = tenant
    and pp.deleted_at is null;
  select p.* into project
  from app.projects p
  where p.id = position.project_id and p.tenant_id = tenant
    and p.deleted_at is null;
  select e.* into engineer
  from app.engineers e
  where e.id = proposal.engineer_id and e.tenant_id = tenant
    and e.deleted_at is null and app.can_access_engineer(e.id, 'engineer.read', 'view');
  select c.* into company
  from app.companies c
  where c.id = proposal.destination_company_id and c.tenant_id = tenant
    and c.deleted_at is null and app.can_access_company(c.id, 'company.read', 'view');
  if position.id is null or project.id is null or engineer.id is null or company.id is null then
    return null;
  end if;

  if proposal.destination_contact_id is not null then
    select c.* into contact
    from app.company_contacts c
    where c.id = proposal.destination_contact_id and c.tenant_id = tenant
      and c.company_id = proposal.destination_company_id
      and c.deleted_at is null and c.contact_status = 'active';
  end if;
  if proposal.resume_version_id is not null then
    select rv.* into resume_version
    from app.engineer_resume_versions rv
    join app.engineer_resumes r
      on r.tenant_id = rv.tenant_id and r.id = rv.resume_id
    where rv.id = proposal.resume_version_id and rv.tenant_id = tenant
      and r.engineer_id = proposal.engineer_id and r.deleted_at is null;
  end if;
  if proposal.requirement_version_id is not null then
    select rv.* into requirement
    from app.project_requirement_versions rv
    join app.project_requirements r
      on r.tenant_id = rv.tenant_id and r.id = rv.project_requirement_id
    where rv.id = proposal.requirement_version_id and rv.tenant_id = tenant
      and r.project_id = project.id and r.deleted_at is null
      and (r.project_position_id is null or r.project_position_id = position.id);
  end if;
  if resume_version.id is null or requirement.id is null then
    return null;
  end if;

  if p_message_template_id is not null then
    select t.* into template
    from app.message_templates t
    where t.id = p_message_template_id and t.tenant_id = tenant
      and t.channel = 'email' and t.is_active;
    if not found then return null; end if;
  end if;

  composition_input := jsonb_build_object(
    'proposal', jsonb_build_object(
      'id', proposal.id,
      'managementNo', proposal.management_no,
      'proposedUnitPrice', proposal.proposed_unit_price,
      'currencyCode', proposal.currency_code,
      'proposedStartDate', proposal.proposed_start_date,
      'validityDate', proposal.validity_date
    ),
    'destination', jsonb_build_object(
      'companyName', coalesce(nullif(company.display_name, ''), company.legal_name),
      'contactName', case when contact.id is null then null
        else concat_ws(' ', contact.family_name, contact.given_name) end,
      'departmentName', contact.department_name,
      'positionTitle', contact.position_title
    ),
    'project', jsonb_build_object(
      'id', project.id,
      'name', project.project_name,
      'summary', project.summary,
      'positionTitle', position.title,
      'roleName', position.role_name,
      'description', position.description,
      'requirementVersionId', requirement.id,
      'requirementTitle', requirement.title,
      'requirementSummary', requirement.summary,
      'mustHave', requirement.must_have_text,
      'niceToHave', requirement.nice_to_have_text,
      'exclusions', requirement.exclusion_text,
      'selectionNotesAvailable', requirement.selection_notes is not null
    ),
    'engineer', jsonb_build_object(
      'id', engineer.id,
      'managementNo', engineer.management_no,
      'displayName', coalesce(nullif(engineer.display_name, ''), engineer.management_no),
      'summary', engineer.summary,
      'availableFrom', engineer.available_from,
      'nearestStation', engineer.nearest_station,
      'resumeVersionId', resume_version.id,
      'resume', private.safe_resume_composition_json(resume_version.structured_data)
    ),
    'template', case when template.id is null then null else jsonb_build_object(
      'id', template.id,
      'name', template.name,
      'subjectTemplate', template.subject_template,
      'bodyTemplate', template.body_template,
      'variables', template.variables
    ) end,
    'settings', jsonb_build_object(
      'tone', v_tone,
      'additionalInstructions', v_instructions
    )
  );

  insert into app.ai_executions(
    tenant_id, execution_type, provider, model_name, prompt_version,
    status, requested_by, started_at, metadata
  ) values (
    tenant, 'proposal.compose', btrim(p_provider), btrim(p_model_name),
    btrim(p_prompt_version), 'running', auth.uid(), now(),
    jsonb_build_object('proposal_id', proposal.id,
      'resume_version_id', resume_version.id,
      'requirement_version_id', requirement.id)
  ) returning * into execution;

  insert into app.outbound_messages(
    tenant_id, proposal_id, project_id, engineer_id, channel, subject,
    body_text, status, created_by, updated_by, ai_execution_id,
    message_template_id
  ) values (
    tenant, proposal.id, project.id, engineer.id, 'email', '', '', 'draft',
    auth.uid(), auth.uid(), execution.id, template.id
  ) returning * into message;

  if contact.id is not null and contact.email is not null then
    insert into app.outbound_message_recipients(
      tenant_id, outbound_message_id, recipient_type, company_contact_id,
      recipient_name, recipient_address
    ) values (
      tenant, message.id, 'to', contact.id,
      concat_ws(' ', contact.family_name, contact.given_name), contact.email
    );
  end if;

  insert into app.ai_execution_inputs(
    tenant_id, ai_execution_id, input_type, content_json,
    source_resource_type, source_resource_id, content_hash
  ) values (
    tenant, execution.id, 'proposal_composition_context', composition_input,
    'proposal', proposal.id,
    encode(public.digest(convert_to(composition_input::text, 'UTF8'), 'sha256'), 'hex')
  );

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'proposal_message.generation_started',
    'outbound_message', message.id, nullif(p_request_id, ''),
    jsonb_build_object('status', message.status, 'row_version', message.row_version),
    jsonb_build_object('proposal_id', proposal.id, 'ai_execution_id', execution.id,
      'resume_version_id', resume_version.id, 'requirement_version_id', requirement.id)
  );

  return jsonb_build_object(
    'draft', private.proposal_message_draft_json(message.id),
    'composition_input', composition_input
  );
end
$$;

create or replace function public.complete_proposal_message_draft(
  p_message_id uuid,
  p_ai_execution_id uuid,
  p_result jsonb,
  p_input_tokens integer default null,
  p_output_tokens integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  message app.outbound_messages%rowtype;
  execution app.ai_executions%rowtype;
  version app.outbound_message_versions%rowtype;
begin
  if auth.uid() is null or tenant is null or p_message_id is null
     or p_ai_execution_id is null or not app.has_permission('ai.execute')
     or jsonb_typeof(p_result) is distinct from 'object'
     or jsonb_typeof(p_result->'confirmationItems') is distinct from 'array'
     or jsonb_typeof(p_result->'evidence') is distinct from 'array'
     or jsonb_typeof(p_result->'policyChecks') is distinct from 'array'
     or jsonb_typeof(p_result->'subject') is distinct from 'string'
     or jsonb_typeof(p_result->'bodyText') is distinct from 'string'
     or nullif(btrim(p_result->>'subject'), '') is null
     or nullif(btrim(p_result->>'bodyText'), '') is null
     or jsonb_typeof(p_result->'engineerIntroduction') is distinct from 'string'
     or p_result - array['subject','bodyText','engineerIntroduction',
       'confirmationItems','evidence','policyChecks'] <> '{}'::jsonb
     or length(p_result->>'subject') > 200
     or length(p_result->>'bodyText') > 20000
     or p_input_tokens < 0 or p_output_tokens < 0
  then
    raise exception 'invalid proposal message result' using errcode = '22023';
  end if;

  if exists (
       select 1 from jsonb_array_elements(p_result->'confirmationItems') item
       where jsonb_typeof(item) is distinct from 'string'
     )
     or exists (
       select 1 from jsonb_array_elements(p_result->'evidence') item
       where jsonb_typeof(item) is distinct from 'object'
         or jsonb_typeof(item->'claim') is distinct from 'string'
         or jsonb_typeof(item->'source') is distinct from 'string'
         or item - array['claim','source'] <> '{}'::jsonb
     )
     or exists (
       select 1 from jsonb_array_elements(p_result->'policyChecks') item
       where jsonb_typeof(item) is distinct from 'object'
         or nullif(item->>'category', '') is null
         or item->>'category' not in ('prohibited_expression',
           'unverified_claim','privacy','template_requirement')
         or nullif(item->>'severity', '') is null
         or item->>'severity' not in ('info','warning','error')
         or jsonb_typeof(item->'text') is distinct from 'string'
         or jsonb_typeof(item->'explanation') is distinct from 'string'
         or item - array['category','severity','text','explanation'] <> '{}'::jsonb
     )
  then
    raise exception 'invalid proposal message result' using errcode = '22023';
  end if;

  select m.* into message
  from app.outbound_messages m
  where m.id = p_message_id and m.tenant_id = tenant
    and m.ai_execution_id = p_ai_execution_id and m.status = 'draft'
    and m.current_version_id is null
    and app.can_access_outbound_message(m.id, 'message.manage', 'edit')
  for update;
  select a.* into execution
  from app.ai_executions a
  where a.id = p_ai_execution_id and a.tenant_id = tenant
    and a.requested_by = auth.uid() and a.status = 'running'
  for update;
  if message.id is null or execution.id is null then
    raise exception 'proposal message generation is not completable' using errcode = '42501';
  end if;

  insert into app.ai_execution_outputs(
    tenant_id, ai_execution_id, output_type, content_json, schema_version,
    content_hash
  ) values (
    tenant, execution.id, 'proposal_message_draft', p_result,
    'proposal.compose.v1',
    encode(public.digest(convert_to(p_result::text, 'UTF8'), 'sha256'), 'hex')
  );

  insert into app.outbound_message_versions(
    tenant_id, outbound_message_id, version_no, subject, body_text,
    generation_source, prompt_snapshot, created_by
  ) values (
    tenant, message.id, 1, btrim(p_result->>'subject'), p_result->>'bodyText',
    'ai', jsonb_build_object('ai_execution_id', execution.id,
      'prompt_version', execution.prompt_version,
      'resume_version_id', execution.metadata->>'resume_version_id',
      'requirement_version_id', execution.metadata->>'requirement_version_id'),
    auth.uid()
  ) returning * into version;

  update app.outbound_messages set
    subject = version.subject, body_text = version.body_text,
    current_version_id = version.id, updated_by = auth.uid()
  where id = message.id;
  update app.ai_executions set
    status = 'review_required', completed_at = now(),
    input_tokens = p_input_tokens, output_tokens = p_output_tokens,
    error_code = null, error_message = null
  where id = execution.id;
  insert into app.ai_execution_reviews(
    tenant_id, ai_execution_id, reviewer_id, review_status
  ) values (tenant, execution.id, null, 'pending');

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'proposal_message.generated',
    'outbound_message', message.id,
    jsonb_build_object('version_id', version.id, 'version_no', version.version_no),
    jsonb_build_object('proposal_id', message.proposal_id,
      'ai_execution_id', execution.id)
  );
  return private.proposal_message_draft_json(message.id);
end
$$;

create or replace function public.fail_proposal_message_draft(
  p_message_id uuid,
  p_ai_execution_id uuid,
  p_error_code text,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
begin
  if auth.uid() is null or tenant is null or not app.has_permission('ai.execute') then
    raise exception 'proposal message failure is not permitted' using errcode = '42501';
  end if;
  update app.ai_executions a set
    status = 'failed', completed_at = now(),
    error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'ai_error'), 100),
    error_message = left(coalesce(nullif(btrim(p_error_message), ''),
      'Proposal message generation failed'), 2000)
  where a.id = p_ai_execution_id and a.tenant_id = tenant
    and a.requested_by = auth.uid() and a.status = 'running'
    and exists (select 1 from app.outbound_messages m
      where m.id = p_message_id and m.tenant_id = tenant
        and m.ai_execution_id = a.id and m.status = 'draft');
end
$$;

create or replace function public.update_proposal_message_draft(
  p_message_id uuid,
  p_row_version bigint,
  p_subject text,
  p_body_text text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  message app.outbound_messages%rowtype;
  version app.outbound_message_versions%rowtype;
  next_version integer;
begin
  if auth.uid() is null or tenant is null or p_message_id is null
     or p_row_version is null or p_row_version < 1
     or not app.has_permission('message.manage')
     or nullif(btrim(p_subject), '') is null or length(p_subject) > 200
     or nullif(btrim(p_body_text), '') is null or length(p_body_text) > 20000
  then
    raise exception 'invalid proposal message update request' using errcode = '22023';
  end if;
  select m.* into message
  from app.outbound_messages m
  where m.id = p_message_id and m.tenant_id = tenant
    and m.status = 'draft' and m.current_version_id is not null
    and app.can_access_outbound_message(m.id, 'message.manage', 'edit')
  for update;
  if not found or message.row_version <> p_row_version then return null; end if;
  select coalesce(max(v.version_no), 0) + 1 into next_version
  from app.outbound_message_versions v
  where v.tenant_id = tenant and v.outbound_message_id = message.id;
  insert into app.outbound_message_versions(
    tenant_id, outbound_message_id, version_no, subject, body_text,
    generation_source, prompt_snapshot, created_by
  ) values (
    tenant, message.id, next_version, btrim(p_subject), p_body_text,
    'manual', jsonb_build_object('edited_from_version_id', message.current_version_id),
    auth.uid()
  ) returning * into version;
  update app.outbound_messages set
    subject = version.subject, body_text = version.body_text,
    current_version_id = version.id, updated_by = auth.uid()
  where id = message.id;
  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data
  ) values (
    tenant, auth.uid(), 'user', 'proposal_message.edited',
    'outbound_message', message.id, nullif(p_request_id, ''),
    jsonb_build_object('version_id', message.current_version_id,
      'row_version', message.row_version),
    jsonb_build_object('version_id', version.id, 'version_no', version.version_no)
  );
  return private.proposal_message_draft_json(message.id);
end
$$;

create or replace function public.review_proposal_message_draft(
  p_message_id uuid,
  p_row_version bigint,
  p_decision text,
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
  message app.outbound_messages%rowtype;
  decision text := lower(btrim(coalesce(p_decision, '')));
  comment_text text := nullif(btrim(p_review_comment), '');
begin
  if auth.uid() is null or tenant is null or p_message_id is null
     or p_row_version is null or p_row_version < 1
     or decision not in ('approve','reject')
     or not app.has_permission('ai.review')
     or not app.has_permission('message.manage')
     or length(coalesce(comment_text, '')) > 2000
     or (decision = 'reject' and comment_text is null)
  then
    raise exception 'invalid proposal message review request' using errcode = '22023';
  end if;
  select m.* into message
  from app.outbound_messages m
  where m.id = p_message_id and m.tenant_id = tenant
    and m.status = 'draft' and m.current_version_id is not null
    and app.can_access_outbound_message(m.id, 'message.manage', 'edit')
  for update;
  if not found or message.row_version <> p_row_version then return null; end if;
  if not exists (
    select 1 from app.ai_execution_reviews r
    where r.tenant_id = tenant and r.ai_execution_id = message.ai_execution_id
      and r.review_status = 'pending'
  ) then return null; end if;

  update app.ai_execution_reviews set
    reviewer_id = auth.uid(),
    review_status = case decision when 'approve' then 'approved' else 'rejected' end,
    reviewed_at = now(), review_comment = comment_text,
    approved_output_ids = case decision when 'approve' then array[
      (select o.id from app.ai_execution_outputs o
       where o.tenant_id = tenant and o.ai_execution_id = message.ai_execution_id
         and o.output_type = 'proposal_message_draft' limit 1)
    ] else '{}'::uuid[] end,
    rejected_output_ids = case decision when 'reject' then array[
      (select o.id from app.ai_execution_outputs o
       where o.tenant_id = tenant and o.ai_execution_id = message.ai_execution_id
         and o.output_type = 'proposal_message_draft' limit 1)
    ] else '{}'::uuid[] end
  where tenant_id = tenant and ai_execution_id = message.ai_execution_id
    and review_status = 'pending';
  update app.ai_executions set status = 'succeeded'
  where tenant_id = tenant and id = message.ai_execution_id
    and status = 'review_required';
  update app.outbound_messages set
    status = case decision when 'approve' then 'approved' else 'cancelled' end,
    approved_version_id = case decision when 'approve' then current_version_id else null end,
    approved_at = case decision when 'approve' then now() else null end,
    approved_by = case decision when 'approve' then auth.uid() else null end,
    updated_by = auth.uid()
  where id = message.id;
  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user',
    case decision when 'approve' then 'proposal_message.approved'
      else 'proposal_message.rejected' end,
    'outbound_message', message.id, nullif(p_request_id, ''),
    jsonb_build_object('status', message.status, 'row_version', message.row_version),
    jsonb_build_object('status', case decision when 'approve' then 'approved' else 'cancelled' end,
      'version_id', message.current_version_id),
    jsonb_build_object('proposal_id', message.proposal_id,
      'ai_execution_id', message.ai_execution_id, 'review_comment', comment_text)
  );
  return private.proposal_message_draft_json(message.id);
end
$$;

create or replace function public.get_proposal_message_draft(
  p_proposal_id uuid,
  p_message_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  message_id uuid;
begin
  if auth.uid() is null or tenant is null or p_proposal_id is null
     or not (app.has_permission('message.read') or app.has_permission('message.manage'))
     or not app.can_access_proposal(p_proposal_id, 'proposal.read', 'view')
  then
    raise exception 'proposal message read is not permitted' using errcode = '42501';
  end if;
  select m.id into message_id
  from app.outbound_messages m
  where m.tenant_id = tenant and m.proposal_id = p_proposal_id
    and m.ai_execution_id is not null
    and (p_message_id is null or m.id = p_message_id)
    and app.can_access_outbound_message(m.id, 'message.read', 'view')
  order by m.created_at desc, m.id desc
  limit 1;
  return case when message_id is null then null
    else private.proposal_message_draft_json(message_id) end;
end
$$;

revoke all on function public.start_proposal_message_draft(uuid, uuid, text, text, text, text, text, text)
  from public, anon;
revoke all on function public.complete_proposal_message_draft(uuid, uuid, jsonb, integer, integer)
  from public, anon;
revoke all on function public.fail_proposal_message_draft(uuid, uuid, text, text)
  from public, anon;
revoke all on function public.update_proposal_message_draft(uuid, bigint, text, text, text)
  from public, anon;
revoke all on function public.review_proposal_message_draft(uuid, bigint, text, text, text)
  from public, anon;
revoke all on function public.get_proposal_message_draft(uuid, uuid)
  from public, anon;

grant execute on function public.start_proposal_message_draft(uuid, uuid, text, text, text, text, text, text)
  to authenticated;
grant execute on function public.complete_proposal_message_draft(uuid, uuid, jsonb, integer, integer)
  to authenticated;
grant execute on function public.fail_proposal_message_draft(uuid, uuid, text, text)
  to authenticated;
grant execute on function public.update_proposal_message_draft(uuid, bigint, text, text, text)
  to authenticated;
grant execute on function public.review_proposal_message_draft(uuid, bigint, text, text, text)
  to authenticated;
grant execute on function public.get_proposal_message_draft(uuid, uuid)
  to authenticated;

comment on function public.start_proposal_message_draft(uuid, uuid, text, text, text, text, text, text) is
  'Starts an audited proposal.compose execution with fixed proposal, requirement, and resume versions and no direct send.';
comment on function public.review_proposal_message_draft(uuid, bigint, text, text, text) is
  'Approves the current immutable draft version or rejects the draft; sending remains a separate operation.';

commit;
