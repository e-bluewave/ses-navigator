-- SES Navigator
-- Migration: 162_sales_activity_read_rpc
-- Purpose: Expose an authorized, paginated company sales activity timeline.

begin;

create or replace function public.list_company_sales_activities(
  p_company_id uuid,
  p_limit integer default 50,
  p_cursor_occurred_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  result jsonb;
begin
  if auth.uid() is null or tenant is null or p_company_id is null
     or p_limit is null or p_limit < 1 or p_limit > 200
     or ((p_cursor_occurred_at is null) <> (p_cursor_id is null))
  then
    raise exception 'invalid sales activity list request' using errcode = '22023';
  end if;

  if not app.can_access_company(p_company_id, 'company.read', 'view') then
    raise exception 'company sales activity read is not permitted' using errcode = '42501';
  end if;

  with visible as (
    select
      activity.id,
      activity.company_id,
      activity.company_contact_id,
      activity.project_id,
      activity.engineer_id,
      activity.activity_type,
      activity.direction,
      activity.occurred_at,
      activity.subject,
      activity.summary,
      activity.result,
      activity.created_at,
      activity.updated_at,
      activity.row_version
    from app.sales_activities activity
    where activity.tenant_id = tenant
      and activity.company_id = p_company_id
      and activity.deleted_at is null
      and app.can_access_sales_activity(activity.id, 'company.read', 'view')
      and (
        p_cursor_occurred_at is null
        or (activity.occurred_at, activity.id) < (p_cursor_occurred_at, p_cursor_id)
      )
    order by activity.occurred_at desc, activity.id desc
    limit p_limit + 1
  ), page as (
    select *
    from visible
    order by occurred_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'company_id', item.company_id,
          'activity_type', item.activity_type,
          'direction', item.direction,
          'occurred_at', item.occurred_at,
          'subject', item.subject,
          'summary', item.summary,
          'result', item.result,
          'contact', case
            when item.company_contact_id is null
              or not app.can_access_company_contact(
                item.company_contact_id, 'company.read', 'view'
              ) then null
            else (
              select jsonb_build_object(
                'id', contact.id,
                'family_name', contact.family_name,
                'given_name', contact.given_name,
                'department_name', contact.department_name,
                'position_title', contact.position_title
              )
              from app.company_contacts contact
              where contact.tenant_id = tenant
                and contact.id = item.company_contact_id
                and contact.deleted_at is null
            )
          end,
          'project', case
            when item.project_id is null
              or not app.can_access_project(item.project_id, 'project.read', 'view')
              then null
            else (
              select jsonb_build_object(
                'id', project.id,
                'management_no', project.management_no,
                'project_name', project.project_name
              )
              from app.projects project
              where project.tenant_id = tenant
                and project.id = item.project_id
                and project.deleted_at is null
            )
          end,
          'engineer', case
            when item.engineer_id is null
              or not app.can_access_engineer(item.engineer_id, 'engineer.read', 'view')
              then null
            else (
              select jsonb_build_object(
                'id', engineer.id,
                'management_no', engineer.management_no,
                'display_name', coalesce(
                  nullif(engineer.display_name, ''),
                  concat_ws(' ', engineer.family_name, engineer.given_name)
                )
              )
              from app.engineers engineer
              where engineer.tenant_id = tenant
                and engineer.id = item.engineer_id
                and engineer.deleted_at is null
            )
          end,
          'follow_up_task', (
            select jsonb_build_object(
              'id', task.id,
              'title', task.title,
              'status', task.status,
              'priority', task.priority,
              'due_at', task.due_at,
              'completed_at', task.completed_at,
              'row_version', task.row_version
            )
            from app.task_links link
            join app.tasks task
              on task.tenant_id = link.tenant_id
             and task.id = link.task_id
             and task.deleted_at is null
            where link.tenant_id = tenant
              and link.resource_type = 'sales_activity'
              and link.resource_id = item.id
              and link.link_type = 'generated_from'
              and app.can_access_task(task.id, 'task.read', 'view')
            order by link.created_at desc, link.id desc
            limit 1
          ),
          'created_at', item.created_at,
          'updated_at', item.updated_at,
          'row_version', item.row_version
        ) order by item.occurred_at desc, item.id desc
      )
      from page item
    ), '[]'::jsonb),
    'next_cursor', case when (select count(*) from visible) > p_limit then (
      select jsonb_build_object(
        'occurred_at', item.occurred_at,
        'id', item.id
      )
      from page item
      order by item.occurred_at, item.id
      limit 1
    ) else null end
  ) into result;

  return result;
end
$$;

revoke all on function public.list_company_sales_activities(
  uuid, integer, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.list_company_sales_activities(
  uuid, integer, timestamptz, uuid
) to authenticated;

comment on function public.list_company_sales_activities(
  uuid, integer, timestamptz, uuid
) is
  'Returns an authorized cursor page of company sales activities, with related records included only when separately readable.';

commit;
