-- SES Navigator
-- Migration: 163_sales_activity_create_follow_up_rpc
-- Purpose: Atomically create a sales activity and an optional owner follow-up task.

begin;

create or replace function public.create_sales_activity_with_follow_up(
  p_company_id uuid,
  p_activity_type text,
  p_occurred_at timestamptz,
  p_subject text,
  p_summary text,
  p_request_id text,
  p_direction text default null,
  p_result text default null,
  p_company_contact_id uuid default null,
  p_project_id uuid default null,
  p_engineer_id uuid default null,
  p_follow_up_title text default null,
  p_follow_up_description text default null,
  p_follow_up_due_at timestamptz default null,
  p_follow_up_priority text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  actor uuid := auth.uid();
  activity app.sales_activities%rowtype;
  task app.tasks%rowtype;
  idempotency app.idempotency_records%rowtype;
  normalized_direction text := nullif(btrim(p_direction), '');
  normalized_subject text := btrim(coalesce(p_subject, ''));
  normalized_summary text := btrim(coalesce(p_summary, ''));
  normalized_result text := nullif(btrim(p_result), '');
  normalized_follow_up_title text := nullif(btrim(p_follow_up_title), '');
  normalized_follow_up_description text := nullif(btrim(p_follow_up_description), '');
  normalized_follow_up_priority text := nullif(btrim(p_follow_up_priority), '');
  follow_up_requested boolean;
  request_hash text;
  result jsonb;
begin
  follow_up_requested := p_follow_up_title is not null
    or p_follow_up_description is not null
    or p_follow_up_due_at is not null
    or p_follow_up_priority is not null;

  if actor is null or tenant is null or p_company_id is null
     or p_activity_type is null
     or p_activity_type not in ('call','email','meeting','visit','proposal','follow_up','other')
     or (normalized_direction is not null
       and normalized_direction not in ('inbound','outbound','internal'))
     or p_occurred_at is null
     or length(normalized_subject) < 1 or length(normalized_subject) > 300
     or length(normalized_summary) < 1 or length(normalized_summary) > 10000
     or length(coalesce(normalized_result, '')) > 10000
     or nullif(btrim(p_request_id), '') is null
     or length(p_request_id) > 200
  then
    raise exception 'invalid sales activity create request' using errcode = '22023';
  end if;

  if not app.can_access_company(p_company_id, 'company.manage', 'edit') then
    raise exception 'company sales activity create is not permitted' using errcode = '42501';
  end if;

  if p_company_contact_id is not null and not exists (
    select 1
    from app.company_contacts contact
    where contact.tenant_id = tenant
      and contact.id = p_company_contact_id
      and contact.company_id = p_company_id
      and contact.deleted_at is null
      and app.can_access_company_contact(contact.id, 'company.read', 'view')
  ) then
    raise exception 'company contact is not available for this company' using errcode = '42501';
  end if;

  if p_project_id is not null and not exists (
    select 1
    from app.projects project
    where project.tenant_id = tenant
      and project.id = p_project_id
      and project.deleted_at is null
      and app.can_access_project(project.id, 'project.read', 'view')
  ) then
    raise exception 'project is not available' using errcode = '42501';
  end if;

  if p_engineer_id is not null and not exists (
    select 1
    from app.engineers engineer
    where engineer.tenant_id = tenant
      and engineer.id = p_engineer_id
      and engineer.deleted_at is null
      and app.can_access_engineer(engineer.id, 'engineer.read', 'view')
  ) then
    raise exception 'engineer is not available' using errcode = '42501';
  end if;

  if follow_up_requested then
    normalized_follow_up_priority := coalesce(normalized_follow_up_priority, 'normal');
    if normalized_follow_up_title is null
       or length(normalized_follow_up_title) > 300
       or length(coalesce(normalized_follow_up_description, '')) > 10000
       or p_follow_up_due_at is null
       or normalized_follow_up_priority not in ('low','normal','high','urgent')
    then
      raise exception 'invalid follow-up task request' using errcode = '22023';
    end if;
    if not app.has_permission('task.manage') then
      raise exception 'task.manage is required for follow-up creation' using errcode = '42501';
    end if;
  else
    normalized_follow_up_priority := null;
  end if;

  request_hash := encode(public.digest(convert_to(jsonb_build_object(
    'company_id', p_company_id,
    'activity_type', p_activity_type,
    'occurred_at', p_occurred_at,
    'subject', normalized_subject,
    'summary', normalized_summary,
    'direction', normalized_direction,
    'result', normalized_result,
    'company_contact_id', p_company_contact_id,
    'project_id', p_project_id,
    'engineer_id', p_engineer_id,
    'follow_up_title', normalized_follow_up_title,
    'follow_up_description', normalized_follow_up_description,
    'follow_up_due_at', p_follow_up_due_at,
    'follow_up_priority', normalized_follow_up_priority
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into app.idempotency_records(
    tenant_id, actor_type, actor_id, operation_name, idempotency_key,
    request_hash, locked_until, expires_at
  ) values (
    tenant, 'user', actor::text, 'sales_activity.create', btrim(p_request_id),
    request_hash, statement_timestamp() + interval '5 minutes',
    statement_timestamp() + interval '7 days'
  )
  on conflict (tenant_id, actor_type, actor_id, operation_name, idempotency_key)
  do nothing;

  select record.* into idempotency
  from app.idempotency_records record
  where record.tenant_id = tenant
    and record.actor_type = 'user'
    and record.actor_id = actor::text
    and record.operation_name = 'sales_activity.create'
    and record.idempotency_key = btrim(p_request_id)
  for update;

  if idempotency.id is null then
    raise exception 'idempotency record is unavailable' using errcode = '55000';
  end if;
  if idempotency.request_hash is distinct from request_hash then
    raise exception 'idempotency key was already used for another request'
      using errcode = '22023';
  end if;
  if idempotency.completed_at is not null then
    return idempotency.response_body;
  end if;

  insert into app.sales_activities(
    tenant_id, company_id, company_contact_id, project_id, engineer_id,
    activity_type, direction, occurred_at, subject, summary, result,
    created_by, updated_by
  ) values (
    tenant, p_company_id, p_company_contact_id, p_project_id, p_engineer_id,
    p_activity_type, normalized_direction, p_occurred_at,
    normalized_subject, normalized_summary, normalized_result,
    actor, actor
  ) returning * into activity;

  if follow_up_requested then
    insert into app.tasks(
      tenant_id, title, description, status, priority, due_at,
      deduplication_key, created_by, updated_by
    ) values (
      tenant, normalized_follow_up_title, normalized_follow_up_description,
      'open', normalized_follow_up_priority, p_follow_up_due_at,
      'sales-activity:' || activity.id::text || ':follow-up', actor, actor
    ) returning * into task;

    insert into app.task_assignments(
      tenant_id, task_id, assignee_user_id, assignment_type, assigned_by
    ) values (
      tenant, task.id, actor, 'owner', actor
    );

    insert into app.task_links(
      tenant_id, task_id, resource_type, resource_id, link_type, created_by
    ) values
      (tenant, task.id, 'sales_activity', activity.id, 'generated_from', actor),
      (tenant, task.id, 'company', p_company_id, 'related', actor);

    if p_company_contact_id is not null then
      insert into app.task_links(
        tenant_id, task_id, resource_type, resource_id, link_type, created_by
      ) values (
        tenant, task.id, 'company_contact', p_company_contact_id, 'related', actor
      );
    end if;
    if p_project_id is not null then
      insert into app.task_links(
        tenant_id, task_id, resource_type, resource_id, link_type, created_by
      ) values (
        tenant, task.id, 'project', p_project_id, 'related', actor
      );
    end if;
    if p_engineer_id is not null then
      insert into app.task_links(
        tenant_id, task_id, resource_type, resource_id, link_type, created_by
      ) values (
        tenant, task.id, 'engineer', p_engineer_id, 'related', actor
      );
    end if;

    insert into audit.task_status_histories(
      tenant_id, task_id, from_status, to_status, reason, changed_by, source
    ) values (
      tenant, task.id, null, 'open',
      'Created from sales activity follow-up', actor, 'user'
    );
  end if;

  result := jsonb_build_object(
    'activity', jsonb_build_object(
      'id', activity.id,
      'company_id', activity.company_id,
      'activity_type', activity.activity_type,
      'direction', activity.direction,
      'occurred_at', activity.occurred_at,
      'subject', activity.subject,
      'summary', activity.summary,
      'result', activity.result,
      'created_at', activity.created_at,
      'updated_at', activity.updated_at,
      'row_version', activity.row_version
    ),
    'follow_up_task', case when task.id is null then null else jsonb_build_object(
      'id', task.id,
      'title', task.title,
      'description', task.description,
      'status', task.status,
      'priority', task.priority,
      'due_at', task.due_at,
      'completed_at', task.completed_at,
      'row_version', task.row_version
    ) end
  );

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action,
    resource_type, resource_id, request_id, after_data, metadata
  ) values (
    tenant, actor, 'user', 'sales_activity.created',
    'sales_activity', activity.id, btrim(p_request_id),
    jsonb_build_object(
      'company_id', activity.company_id,
      'activity_type', activity.activity_type,
      'occurred_at', activity.occurred_at
    ),
    jsonb_build_object('follow_up_task_id', task.id)
  );

  update app.idempotency_records
  set response_status = 201,
      response_body = result,
      completed_at = statement_timestamp(),
      locked_until = null
  where id = idempotency.id;

  return result;
end
$$;

revoke all on function public.create_sales_activity_with_follow_up(
  uuid, text, timestamptz, text, text, text, text, text,
  uuid, uuid, uuid, text, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.create_sales_activity_with_follow_up(
  uuid, text, timestamptz, text, text, text, text, text,
  uuid, uuid, uuid, text, text, timestamptz, text
) to authenticated;

comment on function public.create_sales_activity_with_follow_up(
  uuid, text, timestamptz, text, text, text, text, text,
  uuid, uuid, uuid, text, text, timestamptz, text
) is
  'Creates one authorized company sales activity and, when requested, one directly assigned follow-up task atomically and idempotently.';

commit;
