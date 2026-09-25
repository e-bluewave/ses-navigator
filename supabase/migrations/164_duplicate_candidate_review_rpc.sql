-- SES Navigator
-- Migration: 164_duplicate_candidate_review_rpc
-- Purpose: Expose an authorized cross-entity duplicate review queue and human decision boundary.

begin;

create or replace function public.list_duplicate_candidates(
  p_entity_type text default 'all',
  p_decision text default 'pending',
  p_limit integer default 50,
  p_cursor_score numeric default null,
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
  if auth.uid() is null or tenant is null
     or p_entity_type is null
     or p_entity_type not in ('all', 'company', 'engineer', 'project')
     or p_decision is null
     or p_decision not in ('all', 'pending', 'duplicate', 'not_duplicate', 'hold', 'merged')
     or p_limit is null or p_limit < 1 or p_limit > 200
     or ((p_cursor_score is null) <> (p_cursor_id is null))
  then
    raise exception 'invalid duplicate candidate list request' using errcode = '22023';
  end if;

  with normalized as (
    select
      'company'::text as entity_type,
      candidate.id,
      candidate.match_score as score,
      candidate.match_reasons,
      case candidate.decision
        when 'needs_review' then 'hold'
        else candidate.decision
      end as decision,
      candidate.decision_note as review_note,
      candidate.decided_at as reviewed_at,
      candidate.decided_by as reviewed_by,
      candidate.created_at,
      candidate.source_company_id as left_id,
      candidate.candidate_company_id as right_id,
      jsonb_build_object(
        'id', left_record.id,
        'management_no', left_record.management_no,
        'name', coalesce(nullif(left_record.display_name, ''), left_record.legal_name),
        'status', left_record.status,
        'secondary', left_record.legal_name
      ) as left_record,
      jsonb_build_object(
        'id', right_record.id,
        'management_no', right_record.management_no,
        'name', coalesce(nullif(right_record.display_name, ''), right_record.legal_name),
        'status', right_record.status,
        'secondary', right_record.legal_name
      ) as right_record
    from app.company_duplicate_candidates candidate
    join app.companies left_record
      on left_record.tenant_id = candidate.tenant_id
     and left_record.id = candidate.source_company_id
     and left_record.deleted_at is null
    join app.companies right_record
      on right_record.tenant_id = candidate.tenant_id
     and right_record.id = candidate.candidate_company_id
     and right_record.deleted_at is null
    where candidate.tenant_id = tenant
      and app.can_access_company(candidate.source_company_id, 'company.read', 'view')
      and app.can_access_company(candidate.candidate_company_id, 'company.read', 'view')

    union all

    select
      'engineer'::text,
      candidate.id,
      candidate.duplicate_score,
      candidate.match_reasons,
      case candidate.decision_status
        when 'dismissed' then 'hold'
        else candidate.decision_status
      end,
      candidate.decision_notes,
      candidate.decided_at,
      candidate.decided_by,
      candidate.created_at,
      candidate.engineer_id_a,
      candidate.engineer_id_b,
      jsonb_build_object(
        'id', left_record.id,
        'management_no', left_record.management_no,
        'name', coalesce(
          nullif(left_record.display_name, ''),
          concat_ws(' ', left_record.family_name, left_record.given_name)
        ),
        'status', left_record.status,
        'secondary', left_record.nearest_station
      ),
      jsonb_build_object(
        'id', right_record.id,
        'management_no', right_record.management_no,
        'name', coalesce(
          nullif(right_record.display_name, ''),
          concat_ws(' ', right_record.family_name, right_record.given_name)
        ),
        'status', right_record.status,
        'secondary', right_record.nearest_station
      )
    from app.engineer_duplicate_candidates candidate
    join app.engineers left_record
      on left_record.tenant_id = candidate.tenant_id
     and left_record.id = candidate.engineer_id_a
     and left_record.deleted_at is null
    join app.engineers right_record
      on right_record.tenant_id = candidate.tenant_id
     and right_record.id = candidate.engineer_id_b
     and right_record.deleted_at is null
    where candidate.tenant_id = tenant
      and app.can_access_engineer(candidate.engineer_id_a, 'engineer.read', 'view')
      and app.can_access_engineer(candidate.engineer_id_b, 'engineer.read', 'view')

    union all

    select
      'project'::text,
      candidate.id,
      candidate.match_score,
      candidate.match_reasons,
      case candidate.decision
        when 'ignored' then 'hold'
        else candidate.decision
      end,
      candidate.review_note,
      candidate.reviewed_at,
      candidate.reviewed_by,
      candidate.created_at,
      candidate.source_project_id,
      candidate.candidate_project_id,
      jsonb_build_object(
        'id', left_record.id,
        'management_no', left_record.management_no,
        'name', left_record.project_name,
        'status', left_record.project_status,
        'secondary', left_record.recruitment_status
      ),
      jsonb_build_object(
        'id', right_record.id,
        'management_no', right_record.management_no,
        'name', right_record.project_name,
        'status', right_record.project_status,
        'secondary', right_record.recruitment_status
      )
    from app.project_duplicate_candidates candidate
    join app.projects left_record
      on left_record.tenant_id = candidate.tenant_id
     and left_record.id = candidate.source_project_id
     and left_record.deleted_at is null
    join app.projects right_record
      on right_record.tenant_id = candidate.tenant_id
     and right_record.id = candidate.candidate_project_id
     and right_record.deleted_at is null
    where candidate.tenant_id = tenant
      and app.can_access_project(candidate.source_project_id, 'project.read', 'view')
      and app.can_access_project(candidate.candidate_project_id, 'project.read', 'view')
  ), filtered as (
    select *
    from normalized item
    where (p_entity_type = 'all' or item.entity_type = p_entity_type)
      and (p_decision = 'all' or item.decision = p_decision)
      and (
        p_cursor_score is null
        or (item.score, item.id) < (p_cursor_score, p_cursor_id)
      )
    order by score desc, id desc
    limit p_limit + 1
  ), page as (
    select *
    from filtered
    order by score desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'entity_type', item.entity_type,
          'id', item.id,
          'score', item.score,
          'match_reasons', item.match_reasons,
          'decision', item.decision,
          'review_note', item.review_note,
          'reviewed_at', item.reviewed_at,
          'reviewed_by', item.reviewed_by,
          'created_at', item.created_at,
          'left_record', item.left_record,
          'right_record', item.right_record
        ) order by item.score desc, item.id desc
      )
      from page item
    ), '[]'::jsonb),
    'next_cursor', case when (select count(*) from filtered) > p_limit then (
      select jsonb_build_object('score', item.score, 'id', item.id)
      from page item
      order by item.score, item.id
      limit 1
    ) else null end
  ) into result;

  return result;
end
$$;

create or replace function public.review_duplicate_candidate(
  p_entity_type text,
  p_candidate_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  actor uuid := auth.uid();
  normalized_note text := nullif(btrim(p_note), '');
  result jsonb;
  company_candidate app.company_duplicate_candidates%rowtype;
  engineer_candidate app.engineer_duplicate_candidates%rowtype;
  project_candidate app.project_duplicate_candidates%rowtype;
  stored_decision text;
begin
  if actor is null or tenant is null
     or p_entity_type is null
     or p_entity_type not in ('company', 'engineer', 'project')
     or p_candidate_id is null
     or p_decision is null
     or p_decision not in ('duplicate', 'not_duplicate', 'hold')
     or length(coalesce(normalized_note, '')) > 2000
  then
    raise exception 'invalid duplicate candidate review request' using errcode = '22023';
  end if;

  if p_entity_type = 'company' then
    select candidate.* into company_candidate
    from app.company_duplicate_candidates candidate
    where candidate.tenant_id = tenant
      and candidate.id = p_candidate_id
      and app.can_access_company(candidate.source_company_id, 'company.manage', 'edit')
      and app.can_access_company(candidate.candidate_company_id, 'company.manage', 'edit')
    for update;

    if company_candidate.id is null then
      raise exception 'duplicate candidate review is not permitted' using errcode = '42501';
    end if;

    stored_decision := case p_decision
      when 'hold' then 'needs_review'
      else p_decision
    end;

    update app.company_duplicate_candidates
    set decision = stored_decision,
        decided_at = statement_timestamp(),
        decided_by = actor,
        decision_note = normalized_note,
        updated_by = actor
    where tenant_id = tenant and id = p_candidate_id
    returning * into company_candidate;

    result := jsonb_build_object(
      'entity_type', 'company',
      'id', company_candidate.id,
      'decision', p_decision,
      'review_note', company_candidate.decision_note,
      'reviewed_at', company_candidate.decided_at,
      'reviewed_by', company_candidate.decided_by
    );

  elsif p_entity_type = 'engineer' then
    select candidate.* into engineer_candidate
    from app.engineer_duplicate_candidates candidate
    where candidate.tenant_id = tenant
      and candidate.id = p_candidate_id
      and candidate.decision_status <> 'merged'
      and app.can_access_engineer(candidate.engineer_id_a, 'engineer.manage', 'edit')
      and app.can_access_engineer(candidate.engineer_id_b, 'engineer.manage', 'edit')
    for update;

    if engineer_candidate.id is null then
      raise exception 'duplicate candidate review is not permitted' using errcode = '42501';
    end if;

    stored_decision := case p_decision
      when 'hold' then 'dismissed'
      else p_decision
    end;

    update app.engineer_duplicate_candidates
    set decision_status = stored_decision,
        decided_at = statement_timestamp(),
        decided_by = actor,
        decision_notes = normalized_note
    where tenant_id = tenant and id = p_candidate_id
    returning * into engineer_candidate;

    result := jsonb_build_object(
      'entity_type', 'engineer',
      'id', engineer_candidate.id,
      'decision', p_decision,
      'review_note', engineer_candidate.decision_notes,
      'reviewed_at', engineer_candidate.decided_at,
      'reviewed_by', engineer_candidate.decided_by
    );

  else
    select candidate.* into project_candidate
    from app.project_duplicate_candidates candidate
    where candidate.tenant_id = tenant
      and candidate.id = p_candidate_id
      and candidate.decision <> 'merged'
      and app.can_access_project(candidate.source_project_id, 'project.manage', 'edit')
      and app.can_access_project(candidate.candidate_project_id, 'project.manage', 'edit')
    for update;

    if project_candidate.id is null then
      raise exception 'duplicate candidate review is not permitted' using errcode = '42501';
    end if;

    stored_decision := case p_decision
      when 'hold' then 'ignored'
      else p_decision
    end;

    update app.project_duplicate_candidates
    set decision = stored_decision,
        reviewed_at = statement_timestamp(),
        reviewed_by = actor,
        review_note = normalized_note
    where tenant_id = tenant and id = p_candidate_id
    returning * into project_candidate;

    result := jsonb_build_object(
      'entity_type', 'project',
      'id', project_candidate.id,
      'decision', p_decision,
      'review_note', project_candidate.review_note,
      'reviewed_at', project_candidate.reviewed_at,
      'reviewed_by', project_candidate.reviewed_by
    );
  end if;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action,
    resource_type, resource_id, after_data
  ) values (
    tenant, actor, 'user', 'duplicate_candidate.reviewed',
    p_entity_type || '_duplicate_candidate', p_candidate_id,
    jsonb_build_object(
      'decision', p_decision,
      'review_note', normalized_note
    )
  );

  return result;
end
$$;

revoke all on function public.list_duplicate_candidates(
  text, text, integer, numeric, uuid
) from public, anon, authenticated;
revoke all on function public.review_duplicate_candidate(
  text, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.list_duplicate_candidates(
  text, text, integer, numeric, uuid
) to authenticated;
grant execute on function public.review_duplicate_candidate(
  text, uuid, text, text
) to authenticated;

comment on function public.list_duplicate_candidates(
  text, text, integer, numeric, uuid
) is
  'Lists authorized company, engineer, and project duplicate candidates in one normalized review queue.';

comment on function public.review_duplicate_candidate(
  text, uuid, text, text
) is
  'Records an authorized human duplicate review decision without executing any entity merge.';

commit;
