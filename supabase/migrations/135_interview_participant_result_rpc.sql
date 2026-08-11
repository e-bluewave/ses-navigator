-- SES Navigator
-- Migration: 135_interview_participant_result_rpc
-- Purpose: Save interview participants, feedback, outcome, and terminal status atomically.

begin;

create or replace function public.save_interview_result(
  p_interview_id uuid,
  p_row_version bigint,
  p_status text,
  p_reason text,
  p_participants jsonb,
  p_feedback jsonb,
  p_outcome jsonb,
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
  saved app.interviews%rowtype;
  participant jsonb;
  feedback app.interview_feedback%rowtype;
  outcome app.interview_outcomes%rowtype;
  v_participant_type text;
  v_engineer_id uuid;
  v_user_id uuid;
  v_company_contact_id uuid;
  v_display_name text;
  v_email text;
  v_role_label text;
  v_attendance_status text;
  v_evaluation_type text;
  v_overall_rating smallint;
  v_technical_rating smallint;
  v_communication_rating smallint;
  v_recommendation text;
  v_comments text;
  v_outcome text;
  v_decided_at timestamptz;
  v_decision_source text;
  v_outcome_reason text;
  v_next_action text;
  v_next_action_due_at timestamptz;
  result_participants jsonb;
  result_feedback jsonb;
  result_outcome jsonb;
  result_history jsonb;
begin
  if auth.uid() is null
     or tenant is null
     or p_interview_id is null
     or p_row_version is null
     or p_row_version < 1
     or p_status is null
     or p_status not in ('completed','cancelled','no_show')
     or p_participants is null
     or jsonb_typeof(p_participants) <> 'array'
     or jsonb_array_length(p_participants) > 50
     or (p_feedback is not null and jsonb_typeof(p_feedback) <> 'object')
     or (p_outcome is not null and jsonb_typeof(p_outcome) <> 'object')
     or length(coalesce(btrim(p_reason), '')) > 500
     or (p_status in ('cancelled','no_show') and nullif(btrim(p_reason), '') is null)
     or (p_status = 'completed' and p_outcome is null)
  then
    raise exception 'invalid interview result request' using errcode = '22023';
  end if;

  select i.* into target
  from app.interviews i
  where i.id = p_interview_id
    and i.tenant_id = tenant
    and app.can_access_interview(i.id, 'interview.manage', 'edit')
  for update;

  if not found or target.row_version <> p_row_version then return null; end if;

  if not (
    (target.status = 'scheduled' and p_status in ('completed','cancelled','no_show'))
    or (target.status = 'tentative' and p_status = 'cancelled')
    or target.status = p_status
  ) then
    return null;
  end if;

  delete from app.interview_participants
  where tenant_id = tenant and interview_id = target.id;

  for participant in select value from jsonb_array_elements(p_participants)
  loop
    begin
      v_participant_type := btrim(participant->>'participant_type');
      v_engineer_id := nullif(participant->>'engineer_id', '')::uuid;
      v_user_id := nullif(participant->>'user_id', '')::uuid;
      v_company_contact_id := nullif(participant->>'company_contact_id', '')::uuid;
      v_display_name := nullif(btrim(participant->>'display_name'), '');
      v_email := nullif(btrim(participant->>'email'), '');
      v_role_label := nullif(btrim(participant->>'role_label'), '');
      v_attendance_status := btrim(participant->>'attendance_status');
    exception when others then
      raise exception 'invalid interview participant' using errcode = '22023';
    end;

    if jsonb_typeof(participant) <> 'object'
       or v_participant_type is null
       or v_participant_type not in ('engineer','user','company_contact','other')
       or v_attendance_status is null
       or v_attendance_status not in ('expected','accepted','declined','attended','absent')
       or length(coalesce(v_display_name, '')) > 200
       or length(coalesce(v_email, '')) > 320
       or length(coalesce(v_role_label, '')) > 200
       or (v_email is not null and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
       or (v_participant_type = 'engineer' and (v_engineer_id is null or v_user_id is not null or v_company_contact_id is not null))
       or (v_participant_type = 'user' and (v_user_id is null or v_engineer_id is not null or v_company_contact_id is not null))
       or (v_participant_type = 'company_contact' and (v_company_contact_id is null or v_engineer_id is not null or v_user_id is not null))
       or (v_participant_type = 'other' and (v_display_name is null or v_engineer_id is not null or v_user_id is not null or v_company_contact_id is not null))
    then
      raise exception 'invalid interview participant' using errcode = '22023';
    end if;

    if v_engineer_id is not null and not exists (
      select 1 from app.engineers e
      where e.id = v_engineer_id and e.tenant_id = tenant and e.deleted_at is null
    ) then
      raise exception 'invalid interview participant' using errcode = '22023';
    end if;
    if v_user_id is not null and not exists (
      select 1 from app.tenant_memberships tm
      where tm.tenant_id = tenant and tm.user_id = v_user_id and tm.membership_status = 'active'
    ) then
      raise exception 'invalid interview participant' using errcode = '22023';
    end if;
    if v_company_contact_id is not null and not exists (
      select 1 from app.company_contacts c
      where c.id = v_company_contact_id and c.tenant_id = tenant and c.deleted_at is null
    ) then
      raise exception 'invalid interview participant' using errcode = '22023';
    end if;

    insert into app.interview_participants(
      tenant_id, interview_id, participant_type, engineer_id, user_id,
      company_contact_id, display_name, email, role_label, attendance_status
    ) values (
      tenant, target.id, v_participant_type, v_engineer_id, v_user_id,
      v_company_contact_id, v_display_name, v_email, v_role_label, v_attendance_status
    );
  end loop;

  if p_feedback is not null then
    begin
      v_evaluation_type := nullif(btrim(p_feedback->>'evaluation_type'), '');
      v_overall_rating := nullif(p_feedback->>'overall_rating', '')::smallint;
      v_technical_rating := nullif(p_feedback->>'technical_rating', '')::smallint;
      v_communication_rating := nullif(p_feedback->>'communication_rating', '')::smallint;
      v_recommendation := nullif(btrim(p_feedback->>'recommendation'), '');
      v_comments := nullif(btrim(p_feedback->>'comments'), '');
    exception when others then
      raise exception 'invalid interview feedback' using errcode = '22023';
    end;
    if v_evaluation_type is null
       or v_evaluation_type <> 'internal'
       or (v_overall_rating is not null and v_overall_rating not between 1 and 5)
       or (v_technical_rating is not null and v_technical_rating not between 1 and 5)
       or (v_communication_rating is not null and v_communication_rating not between 1 and 5)
       or (v_recommendation is not null and v_recommendation not in ('strong_yes','yes','hold','no','strong_no'))
       or length(coalesce(v_comments, '')) > 5000
       or (v_overall_rating is null and v_technical_rating is null and v_communication_rating is null and v_recommendation is null and v_comments is null)
    then
      raise exception 'invalid interview feedback' using errcode = '22023';
    end if;

    select f.* into feedback
    from app.interview_feedback f
    where f.tenant_id = tenant
      and f.interview_id = target.id
      and f.evaluator_user_id = auth.uid()
      and f.evaluation_type = 'internal'
    order by f.created_at desc, f.id desc
    limit 1
    for update;

    if found then
      update app.interview_feedback
      set overall_rating = v_overall_rating,
          technical_rating = v_technical_rating,
          communication_rating = v_communication_rating,
          recommendation = v_recommendation,
          comments = v_comments,
          submitted_at = statement_timestamp()
      where id = feedback.id
      returning * into feedback;
    else
      insert into app.interview_feedback(
        tenant_id, interview_id, evaluator_user_id, evaluation_type,
        overall_rating, technical_rating, communication_rating,
        recommendation, comments, submitted_at
      ) values (
        tenant, target.id, auth.uid(), 'internal',
        v_overall_rating, v_technical_rating, v_communication_rating,
        v_recommendation, v_comments, statement_timestamp()
      ) returning * into feedback;
    end if;
  end if;

  if p_outcome is not null then
    begin
      v_outcome := btrim(p_outcome->>'outcome');
      v_decided_at := nullif(p_outcome->>'decided_at', '')::timestamptz;
      v_decision_source := nullif(btrim(p_outcome->>'decision_source'), '');
      v_outcome_reason := nullif(btrim(p_outcome->>'reason'), '');
      v_next_action := nullif(btrim(p_outcome->>'next_action'), '');
      v_next_action_due_at := nullif(p_outcome->>'next_action_due_at', '')::timestamptz;
    exception when others then
      raise exception 'invalid interview outcome' using errcode = '22023';
    end;
    if v_outcome is null
       or v_outcome not in ('pass','fail','hold','withdrawn','pending')
       or v_decision_source is null
       or v_decision_source not in ('customer','internal','engineer','system')
       or (v_outcome <> 'pending' and v_decided_at is null)
       or length(coalesce(v_outcome_reason, '')) > 2000
       or length(coalesce(v_next_action, '')) > 2000
    then
      raise exception 'invalid interview outcome' using errcode = '22023';
    end if;

    insert into app.interview_outcomes(
      tenant_id, interview_id, outcome, decided_at, decision_source,
      reason, next_action, next_action_due_at, created_by, updated_by
    ) values (
      tenant, target.id, v_outcome, v_decided_at, v_decision_source,
      v_outcome_reason, v_next_action, v_next_action_due_at, auth.uid(), auth.uid()
    )
    on conflict (tenant_id, interview_id)
    do update set
      outcome = excluded.outcome,
      decided_at = excluded.decided_at,
      decision_source = excluded.decision_source,
      reason = excluded.reason,
      next_action = excluded.next_action,
      next_action_due_at = excluded.next_action_due_at,
      updated_by = excluded.updated_by
    returning * into outcome;
  end if;

  update app.interviews
  set status = p_status, updated_by = auth.uid()
  where id = target.id
  returning * into saved;

  if target.status <> saved.status then
    insert into app.interview_status_histories(
      tenant_id, interview_id, from_status, to_status, changed_by, reason, metadata
    ) values (
      tenant, saved.id, target.status, saved.status, auth.uid(),
      nullif(btrim(p_reason), ''),
      jsonb_build_object('request_id', nullif(p_request_id, ''))
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) - 'tenant_id' order by p.created_at, p.id), '[]'::jsonb)
    into result_participants
  from app.interview_participants p
  where p.tenant_id = tenant and p.interview_id = saved.id;

  select coalesce(jsonb_agg(to_jsonb(f) - 'tenant_id' order by f.created_at, f.id), '[]'::jsonb)
    into result_feedback
  from app.interview_feedback f
  where f.tenant_id = tenant and f.interview_id = saved.id;

  select to_jsonb(o) - array['tenant_id','created_by','updated_by']
    into result_outcome
  from app.interview_outcomes o
  where o.tenant_id = tenant and o.interview_id = saved.id;

  select coalesce(jsonb_agg(to_jsonb(h) - 'tenant_id' order by h.changed_at, h.id), '[]'::jsonb)
    into result_history
  from app.interview_status_histories h
  where h.tenant_id = tenant and h.interview_id = saved.id;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'interview.result_saved', 'interview', saved.id,
    nullif(p_request_id, ''),
    jsonb_build_object('status', target.status, 'row_version', target.row_version),
    jsonb_build_object('status', saved.status, 'row_version', saved.row_version),
    jsonb_build_object(
      'participant_count', jsonb_array_length(result_participants),
      'feedback_count', jsonb_array_length(result_feedback),
      'outcome', result_outcome->>'outcome'
    )
  );

  return (to_jsonb(saved) - array['tenant_id','created_by','updated_by'])
    || jsonb_build_object(
      'participants', result_participants,
      'feedback', result_feedback,
      'outcome', result_outcome,
      'status_history', result_history
    );
end
$$;

revoke all on function public.save_interview_result(uuid, bigint, text, text, jsonb, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.save_interview_result(uuid, bigint, text, text, jsonb, jsonb, jsonb, text)
  to authenticated;

comment on function public.save_interview_result(uuid, bigint, text, text, jsonb, jsonb, jsonb, text) is
  'Atomically saves authorized interview participants, current-user feedback, outcome, terminal status, history, and audit.';

commit;
