-- SES Navigator
-- Migration: 134_interview_write_schedule_candidates_rpc
-- Purpose: Save interview scheduling details and candidate times through one reviewed RPC.

begin;

create table app.interview_schedule_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  interview_id uuid not null,
  candidate_start_at timestamptz not null,
  candidate_end_at timestamptz not null,
  candidate_order integer not null check (candidate_order > 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, interview_id, candidate_order),
  unique (tenant_id, interview_id, candidate_start_at),
  foreign key (tenant_id, interview_id)
    references app.interviews(tenant_id, id) on delete cascade,
  check (candidate_end_at > candidate_start_at)
);

create index interview_schedule_candidates_interview_idx
  on app.interview_schedule_candidates(tenant_id, interview_id, candidate_order);

create unique index interviews_proposal_round_uidx
  on app.interviews(tenant_id, proposal_id, interview_round);

select app.attach_updated_at_trigger('app.interview_schedule_candidates'::regclass);
select app.attach_row_version_trigger('app.interview_schedule_candidates'::regclass);

alter table app.interview_schedule_candidates enable row level security;
alter table app.interview_schedule_candidates force row level security;

select private.install_authorization_policies(
  'app.interview_schedule_candidates',
  'app.can_access_interview(interview_id, ''interview.read'', ''view'')',
  'app.can_access_interview(interview_id, ''interview.manage'', ''edit'')',
  'app.can_access_interview(interview_id, ''interview.manage'', ''edit'')'
);

grant select on table app.interview_schedule_candidates to authenticated;

create or replace function public.save_interview(
  p_interview_id uuid,
  p_row_version bigint,
  p_interview jsonb,
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
  proposal app.proposals%rowtype;
  candidate jsonb;
  candidates jsonb;
  result_candidates jsonb;
  v_proposal_id uuid;
  v_interview_round integer;
  v_interview_type text;
  v_status text;
  v_scheduled_start_at timestamptz;
  v_scheduled_end_at timestamptz;
  v_location_text text;
  v_meeting_url text;
  v_notes text;
  v_candidate_start_at timestamptz;
  v_candidate_end_at timestamptz;
  v_candidate_order integer := 0;
begin
  if auth.uid() is null
     or tenant is null
     or p_row_version is null
     or p_row_version < 0
     or jsonb_typeof(p_interview) <> 'object'
  then
    raise exception 'invalid interview save request' using errcode = '22023';
  end if;

  begin
    v_proposal_id := (p_interview->>'proposal_id')::uuid;
    v_interview_round := (p_interview->>'interview_round')::integer;
    v_interview_type := btrim(p_interview->>'interview_type');
    v_status := btrim(p_interview->>'status');
    v_scheduled_start_at := nullif(p_interview->>'scheduled_start_at', '')::timestamptz;
    v_scheduled_end_at := nullif(p_interview->>'scheduled_end_at', '')::timestamptz;
    v_location_text := nullif(btrim(p_interview->>'location_text'), '');
    v_meeting_url := nullif(btrim(p_interview->>'meeting_url'), '');
    v_notes := nullif(btrim(p_interview->>'notes'), '');
    candidates := coalesce(p_interview->'schedule_candidates', '[]'::jsonb);
  exception when others then
    raise exception 'invalid interview fields' using errcode = '22023';
  end;

  if v_proposal_id is null
     or v_interview_round not between 1 and 99
     or v_interview_type not in ('online','onsite','phone','other')
     or v_status not in ('tentative','scheduled')
     or jsonb_typeof(candidates) <> 'array'
     or jsonb_array_length(candidates) > 10
     or length(coalesce(v_location_text, '')) > 500
     or length(coalesce(v_meeting_url, '')) > 2000
     or length(coalesce(v_notes, '')) > 5000
     or (v_meeting_url is not null and v_meeting_url !~ '^https?://')
     or ((v_scheduled_start_at is null) <> (v_scheduled_end_at is null))
     or (v_scheduled_start_at is not null and v_scheduled_end_at <= v_scheduled_start_at)
     or (v_status = 'scheduled' and v_scheduled_start_at is null)
  then
    raise exception 'invalid interview fields' using errcode = '22023';
  end if;

  select p.* into proposal
  from app.proposals p
  where p.id = v_proposal_id
    and p.tenant_id = tenant
    and p.deleted_at is null
    and p.status in ('interview_requested','interviewing')
    and app.can_access_proposal(p.id, 'interview.manage', 'edit');

  if not found then return null; end if;

  if p_interview_id is null then
    if p_row_version <> 0 then return null; end if;
    insert into app.interviews(
      tenant_id, proposal_id, interview_round, interview_type, status,
      scheduled_start_at, scheduled_end_at, location_text, meeting_url, notes,
      created_by, updated_by
    ) values (
      tenant, proposal.id, v_interview_round, v_interview_type, v_status,
      v_scheduled_start_at, v_scheduled_end_at, v_location_text, v_meeting_url,
      v_notes, auth.uid(), auth.uid()
    ) returning * into saved;

    insert into app.interview_status_histories(
      tenant_id, interview_id, from_status, to_status, changed_by, reason, metadata
    ) values (
      tenant, saved.id, null, saved.status, auth.uid(), 'Interview created',
      jsonb_build_object('request_id', nullif(p_request_id, ''))
    );
  else
    select i.* into target
    from app.interviews i
    where i.id = p_interview_id
      and i.tenant_id = tenant
      and app.can_access_interview(i.id, 'interview.manage', 'edit')
    for update;

    if not found
       or target.row_version <> p_row_version
       or target.status not in ('tentative','scheduled')
       or target.proposal_id <> v_proposal_id
    then
      return null;
    end if;

    update app.interviews
    set interview_round = v_interview_round,
        interview_type = v_interview_type,
        status = v_status,
        scheduled_start_at = v_scheduled_start_at,
        scheduled_end_at = v_scheduled_end_at,
        location_text = v_location_text,
        meeting_url = v_meeting_url,
        notes = v_notes,
        updated_by = auth.uid()
    where id = target.id
    returning * into saved;

    if target.status <> saved.status then
      insert into app.interview_status_histories(
        tenant_id, interview_id, from_status, to_status, changed_by, reason, metadata
      ) values (
        tenant, saved.id, target.status, saved.status, auth.uid(),
        'Interview schedule updated',
        jsonb_build_object('request_id', nullif(p_request_id, ''))
      );
    end if;

    delete from app.interview_schedule_candidates
    where tenant_id = tenant and interview_id = saved.id;
  end if;

  for candidate in select value from jsonb_array_elements(candidates)
  loop
    begin
      v_candidate_start_at := (candidate->>'start_at')::timestamptz;
      v_candidate_end_at := (candidate->>'end_at')::timestamptz;
    exception when others then
      raise exception 'invalid interview schedule candidate' using errcode = '22023';
    end;
    if jsonb_typeof(candidate) <> 'object'
       or v_candidate_start_at is null
       or v_candidate_end_at <= v_candidate_start_at
    then
      raise exception 'invalid interview schedule candidate' using errcode = '22023';
    end if;
    v_candidate_order := v_candidate_order + 1;
    insert into app.interview_schedule_candidates(
      tenant_id, interview_id, candidate_start_at, candidate_end_at,
      candidate_order, created_by, updated_by
    ) values (
      tenant, saved.id, v_candidate_start_at, v_candidate_end_at,
      v_candidate_order, auth.uid(), auth.uid()
    );
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'candidate_start_at', c.candidate_start_at,
        'candidate_end_at', c.candidate_end_at,
        'candidate_order', c.candidate_order
      ) order by c.candidate_order
    ),
    '[]'::jsonb
  ) into result_candidates
  from app.interview_schedule_candidates c
  where c.tenant_id = tenant and c.interview_id = saved.id;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user',
    case when p_interview_id is null then 'interview.created' else 'interview.updated' end,
    'interview', saved.id, nullif(p_request_id, ''),
    case when p_interview_id is null then null else
      jsonb_build_object('status', target.status, 'row_version', target.row_version) end,
    jsonb_build_object('status', saved.status, 'row_version', saved.row_version),
    jsonb_build_object(
      'proposal_id', saved.proposal_id,
      'interview_round', saved.interview_round,
      'candidate_count', jsonb_array_length(result_candidates)
    )
  );

  return (to_jsonb(saved) - array['tenant_id','created_by','updated_by'])
    || jsonb_build_object(
      'proposal_management_no', proposal.management_no,
      'project_position_id', proposal.project_position_id,
      'engineer_id', proposal.engineer_id,
      'schedule_candidates', result_candidates
    );
end
$$;

revoke all on function public.save_interview(uuid, bigint, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.save_interview(uuid, bigint, jsonb, text)
  to authenticated;

comment on function public.save_interview(uuid, bigint, jsonb, text) is
  'Creates or updates one authorized interview schedule with candidates, optimistic locking, status history, and audit.';

commit;
