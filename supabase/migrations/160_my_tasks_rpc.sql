-- SES Navigator
-- Migration: 160_my_tasks_rpc
-- Purpose: Expose a least-privilege My Tasks read/update boundary.

begin;

create or replace function public.list_my_tasks(
  p_scope text default 'incomplete',
  p_time_zone text default 'Asia/Tokyo',
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  tenant uuid := app.current_tenant_id();
  actor uuid := auth.uid();
  today_start timestamptz;
  tomorrow_start timestamptz;
  result jsonb;
begin
  if tenant is null or actor is null or not app.has_permission('task.read') then
    raise exception 'task.read is required' using errcode = '42501';
  end if;
  if p_scope is null
     or p_scope not in ('all', 'incomplete', 'completed', 'overdue', 'today', 'upcoming')
     or p_time_zone is null
     or length(p_time_zone) > 100
     or not exists (select 1 from pg_timezone_names where name = p_time_zone)
     or p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'invalid my tasks list request' using errcode = '22023';
  end if;

  today_start := (((now() at time zone p_time_zone)::date)::timestamp at time zone p_time_zone);
  tomorrow_start := ((((now() at time zone p_time_zone)::date + 1)::timestamp) at time zone p_time_zone);

  select jsonb_build_object(
    'items', coalesce(jsonb_agg(item order by sort_completed, sort_due, sort_updated desc), '[]'::jsonb)
  )
  into result
  from (
    select
      jsonb_build_object(
        'id', task.id,
        'title', task.title,
        'description', task.description,
        'status', task.status,
        'priority', task.priority,
        'due_at', task.due_at,
        'completed_at', task.completed_at,
        'is_completed', task.status = 'completed',
        'is_overdue', task.status not in ('completed', 'cancelled') and task.due_at < today_start,
        'is_due_today', task.status not in ('completed', 'cancelled') and task.due_at >= today_start and task.due_at < tomorrow_start,
        'is_upcoming', task.status not in ('completed', 'cancelled') and task.due_at >= tomorrow_start,
        'due_category', case
          when task.status = 'completed' then 'completed'
          when task.status = 'cancelled' then 'none'
          when task.due_at < today_start then 'overdue'
          when task.due_at < tomorrow_start then 'today'
          when task.due_at is not null then 'upcoming'
          else 'none'
        end,
        'assignment', jsonb_build_object(
          'assignment_type', assignment.assignment_type,
          'assigned_at', assignment.assigned_at
        ),
        'links', coalesce((
          select jsonb_agg(jsonb_build_object(
            'resource_type', link.resource_type,
            'resource_id', link.resource_id,
            'link_type', link.link_type
          ) order by link.created_at, link.id)
          from app.task_links link
          where link.tenant_id = task.tenant_id and link.task_id = task.id
        ), '[]'::jsonb),
        'created_at', task.created_at,
        'updated_at', task.updated_at,
        'row_version', task.row_version
      ) as item,
      case when task.status = 'completed' then 1 else 0 end as sort_completed,
      task.due_at as sort_due,
      task.updated_at as sort_updated
    from app.tasks task
    join lateral (
      select assignment.assignment_type, assignment.assigned_at
      from app.task_assignments assignment
      where assignment.tenant_id = task.tenant_id
        and assignment.task_id = task.id
        and assignment.assignee_user_id = actor
      order by case assignment.assignment_type
        when 'owner' then 1 when 'collaborator' then 2 else 3 end,
        assignment.assigned_at
      limit 1
    ) assignment on true
    where task.tenant_id = tenant
      and task.deleted_at is null
      and app.can_access_task(task.id, 'task.read', 'view')
      and case p_scope
        when 'all' then true
        when 'incomplete' then task.status not in ('completed', 'cancelled')
        when 'completed' then task.status = 'completed'
        when 'overdue' then task.status not in ('completed', 'cancelled') and task.due_at < today_start
        when 'today' then task.status not in ('completed', 'cancelled') and task.due_at >= today_start and task.due_at < tomorrow_start
        when 'upcoming' then task.status not in ('completed', 'cancelled') and task.due_at >= tomorrow_start
      end
    order by
      case when task.status = 'completed' then 1 else 0 end,
      task.due_at nulls last,
      task.updated_at desc
    limit p_limit
  ) listed;

  return result;
end;
$$;

create or replace function public.update_my_task(
  p_task_id uuid,
  p_row_version bigint,
  p_status text default null,
  p_due_at timestamptz default null,
  p_clear_due_at boolean default false,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  tenant uuid := app.current_tenant_id();
  actor uuid := auth.uid();
  target app.tasks%rowtype;
  saved app.tasks%rowtype;
  next_status text;
begin
  if tenant is null or actor is null or not app.has_permission('task.manage') then
    raise exception 'task.manage is required' using errcode = '42501';
  end if;
  if p_task_id is null or p_row_version is null or p_row_version < 1
     or p_clear_due_at is null
     or (p_status is null and p_due_at is null and not p_clear_due_at)
     or p_due_at is not null and p_clear_due_at
     or p_status is not null and p_status not in ('open', 'in_progress', 'blocked', 'completed', 'cancelled')
     or p_reason is not null and length(p_reason) > 1000 then
    raise exception 'invalid my task update request' using errcode = '22023';
  end if;

  select task.* into target
  from app.tasks task
  where task.tenant_id = tenant
    and task.id = p_task_id
    and task.row_version = p_row_version
    and task.deleted_at is null
    and app.can_access_task(task.id, 'task.manage', 'edit')
    and exists (
      select 1
      from app.task_assignments assignment
      where assignment.tenant_id = task.tenant_id
        and assignment.task_id = task.id
        and assignment.assignee_user_id = actor
    )
  for update;

  if target.id is null then
    return null;
  end if;

  next_status := coalesce(p_status, target.status);
  update app.tasks set
    status = next_status,
    due_at = case
      when p_clear_due_at then null
      when p_due_at is not null then p_due_at
      else target.due_at
    end,
    completed_at = case
      when next_status = 'completed' then coalesce(target.completed_at, now())
      else null
    end,
    updated_by = actor
  where tenant_id = tenant and id = target.id
  returning * into saved;

  if target.status <> saved.status then
    insert into audit.task_status_histories(
      tenant_id, task_id, from_status, to_status, reason, changed_by, source
    ) values (
      tenant, saved.id, target.status, saved.status, nullif(btrim(p_reason), ''), actor, 'user'
    );
  end if;

  return jsonb_build_object(
    'id', saved.id,
    'title', saved.title,
    'description', saved.description,
    'status', saved.status,
    'priority', saved.priority,
    'due_at', saved.due_at,
    'completed_at', saved.completed_at,
    'created_at', saved.created_at,
    'updated_at', saved.updated_at,
    'row_version', saved.row_version
  );
end;
$$;

revoke all on function public.list_my_tasks(text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.update_my_task(uuid, bigint, text, timestamptz, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_tasks(text, text, integer) to authenticated;
grant execute on function public.update_my_task(uuid, bigint, text, timestamptz, boolean, text) to authenticated;

comment on function public.list_my_tasks(text, text, integer) is
  'Lists only tasks directly assigned to the current authenticated user in the current tenant.';
comment on function public.update_my_task(uuid, bigint, text, timestamptz, boolean, text) is
  'Updates a directly assigned task with optimistic locking and append-only status history.';

commit;
