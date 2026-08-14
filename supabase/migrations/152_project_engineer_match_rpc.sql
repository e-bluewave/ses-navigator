-- SES Navigator
-- Migration: 152_project_engineer_match_rpc
-- Purpose: Calculate deterministic project-engineer matches and store AI explanations.

begin;

create table app.project_engineer_match_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  project_id uuid not null,
  project_requirement_version_id uuid,
  ai_execution_id uuid not null,
  status text not null default 'explaining'
    check (status in ('explaining','completed','explanation_failed')),
  calculation_version text not null,
  criteria_snapshot jsonb not null,
  candidate_count integer not null default 0 check (candidate_count between 0 and 5),
  overall_summary text,
  requested_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, ai_execution_id),
  foreign key (tenant_id, project_id)
    references app.projects(tenant_id, id) on delete cascade,
  foreign key (tenant_id, project_requirement_version_id)
    references app.project_requirement_versions(tenant_id, id)
    on delete set null (project_requirement_version_id),
  foreign key (tenant_id, ai_execution_id)
    references app.ai_executions(tenant_id, id) on delete cascade
);

create table app.project_engineer_match_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  match_run_id uuid not null,
  engineer_id uuid not null,
  resume_version_id uuid,
  candidate_rank integer not null check (candidate_rank between 1 and 5),
  overall_score numeric(5,2) not null check (overall_score between 0 and 100),
  required_skill_score numeric(5,2) not null check (required_skill_score between 0 and 100),
  preferred_skill_score numeric(5,2) not null check (preferred_skill_score between 0 and 100),
  availability_score numeric(5,2) not null check (availability_score between 0 and 100),
  rate_score numeric(5,2) not null check (rate_score between 0 and 100),
  location_score numeric(5,2) not null check (location_score between 0 and 100),
  required_conditions_met boolean not null,
  confidence_score numeric(5,4) not null check (confidence_score between 0 and 1),
  matched_skills jsonb not null default '[]'::jsonb,
  missing_skills jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  facts_snapshot jsonb not null,
  explanation jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (match_run_id, engineer_id),
  unique (match_run_id, candidate_rank),
  foreign key (tenant_id, match_run_id)
    references app.project_engineer_match_runs(tenant_id, id) on delete cascade,
  foreign key (tenant_id, engineer_id)
    references app.engineers(tenant_id, id) on delete cascade,
  foreign key (tenant_id, resume_version_id)
    references app.engineer_resume_versions(tenant_id, id)
    on delete set null (resume_version_id),
  check (jsonb_typeof(matched_skills) = 'array'),
  check (jsonb_typeof(missing_skills) = 'array'),
  check (jsonb_typeof(warnings) = 'array'),
  check (jsonb_typeof(facts_snapshot) = 'object'),
  check (explanation is null or jsonb_typeof(explanation) = 'object')
);

create index project_engineer_match_runs_project_idx
  on app.project_engineer_match_runs(tenant_id, project_id, created_at desc);
create index project_engineer_match_runs_requirement_version_idx
  on app.project_engineer_match_runs(tenant_id, project_requirement_version_id)
  where project_requirement_version_id is not null;
create index project_engineer_match_candidates_run_idx
  on app.project_engineer_match_candidates(tenant_id, match_run_id, candidate_rank);
create index project_engineer_match_candidates_engineer_idx
  on app.project_engineer_match_candidates(tenant_id, engineer_id, created_at desc);
create index project_engineer_match_candidates_resume_version_idx
  on app.project_engineer_match_candidates(tenant_id, resume_version_id)
  where resume_version_id is not null;

alter table app.project_engineer_match_runs enable row level security;
alter table app.project_engineer_match_runs force row level security;
alter table app.project_engineer_match_candidates enable row level security;
alter table app.project_engineer_match_candidates force row level security;
revoke all on table app.project_engineer_match_runs from public, anon, authenticated;
revoke all on table app.project_engineer_match_candidates from public, anon, authenticated;
grant all on table app.project_engineer_match_runs to service_role;
grant all on table app.project_engineer_match_candidates to service_role;

create or replace function private.match_skill_key(p_tenant_id uuid, p_name text)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    (
      select lower(normalize(s.name, NFKC))
      from app.skill_aliases a
      join app.skills s on s.id = a.skill_id
      where a.is_active
        and a.alias_normalized = lower(normalize(btrim(p_name), NFKC))
        and (a.tenant_id = p_tenant_id or a.tenant_id is null)
        and (s.tenant_id = p_tenant_id or s.tenant_id is null)
      order by (a.tenant_id = p_tenant_id) desc
      limit 1
    ),
    lower(normalize(btrim(p_name), NFKC))
  )
$$;
revoke all on function private.match_skill_key(uuid,text) from public,anon,authenticated;

create or replace function public.get_project_engineer_match(
  p_project_id uuid,
  p_match_run_id uuid default null
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
     or not app.can_access_project(p_project_id, 'project.read', 'view')
     or not (app.has_permission('ai.read') or app.has_permission('ai.execute'))
  then
    raise exception 'project match is not accessible' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', r.id,
    'project_id', r.project_id,
    'project_requirement_version_id', r.project_requirement_version_id,
    'ai_execution_id', r.ai_execution_id,
    'status', r.status,
    'calculation_version', r.calculation_version,
    'criteria', r.criteria_snapshot,
    'candidate_count', r.candidate_count,
    'overall_summary', r.overall_summary,
    'error_message', r.error_message,
    'created_at', r.created_at,
    'completed_at', r.completed_at,
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'engineer_id', c.engineer_id,
        'resume_version_id', c.resume_version_id,
        'rank', c.candidate_rank,
        'overall_score', c.overall_score,
        'required_skill_score', c.required_skill_score,
        'preferred_skill_score', c.preferred_skill_score,
        'availability_score', c.availability_score,
        'rate_score', c.rate_score,
        'location_score', c.location_score,
        'required_conditions_met', c.required_conditions_met,
        'confidence_score', c.confidence_score,
        'matched_skills', c.matched_skills,
        'missing_skills', c.missing_skills,
        'warnings', c.warnings,
        'facts', c.facts_snapshot,
        'explanation', c.explanation
      ) order by c.candidate_rank)
      from app.project_engineer_match_candidates c
      where c.tenant_id = r.tenant_id and c.match_run_id = r.id
    ), '[]'::jsonb)
  ) into result
  from app.project_engineer_match_runs r
  join app.ai_executions a
    on a.tenant_id = r.tenant_id and a.id = r.ai_execution_id
  where r.tenant_id = tenant and r.project_id = p_project_id
    and (p_match_run_id is null or r.id = p_match_run_id)
    and (a.requested_by = auth.uid()
      or app.has_permission('ai.read', null)
      or app.has_permission('ai.review', null))
  order by r.created_at desc
  limit 1;

  return result;
end
$$;

create or replace function public.calculate_project_engineer_matches(
  p_project_id uuid,
  p_limit integer,
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
  target_project app.projects%rowtype;
  target_requirement_version_id uuid;
  project_start date;
  project_rate_min bigint;
  project_rate_max bigint;
  project_currency text;
  project_prefecture text;
  project_station text;
  project_remote_type text;
  criteria jsonb;
  execution app.ai_executions%rowtype;
  run app.project_engineer_match_runs%rowtype;
  candidate record;
  required_total numeric;
  required_matched numeric;
  preferred_total numeric;
  preferred_matched numeric;
  required_score numeric;
  preferred_score numeric;
  availability_score numeric;
  rate_score numeric;
  location_score numeric;
  overall_score numeric;
  confidence numeric;
  matched jsonb;
  missing jsonb;
  warning_list text[];
  fact jsonb;
  match_input jsonb;
begin
  if auth.uid() is null or tenant is null
     or p_project_id is null or p_limit is null or p_limit not between 1 and 5
     or nullif(btrim(p_provider), '') is null
     or nullif(btrim(p_model_name), '') is null
     or nullif(btrim(p_prompt_version), '') is null
     or not app.has_permission('ai.execute')
     or not app.can_access_project(p_project_id, 'project.read', 'view')
  then
    raise exception 'project match is not executable' using errcode = '42501';
  end if;

  select * into target_project
  from app.projects p
  where p.id = p_project_id and p.tenant_id = tenant and p.deleted_at is null;
  if not found then
    raise exception 'project match target is not accessible' using errcode = '42501';
  end if;

  select v.id into target_requirement_version_id
  from app.project_requirements r
  join app.project_requirement_versions v
    on v.tenant_id = r.tenant_id and v.project_requirement_id = r.id
  where r.tenant_id = tenant and r.project_id = p_project_id
    and r.status in ('draft','active') and r.deleted_at is null
  order by r.updated_at desc, v.version_no desc
  limit 1;

  select coalesce(pos.desired_start_date, pos.start_date, target_project.planned_start_on)
    into project_start
  from (select 1) singleton
  left join lateral (
    select p.desired_start_date, p.start_date
    from app.project_positions p
    where p.tenant_id = tenant and p.project_id = p_project_id
      and p.status in ('draft','open') and p.deleted_at is null
    order by case p.priority
      when 'urgent' then 4
      when 'high' then 3
      when 'normal' then 2
      when 'low' then 1
      else 0
    end desc, p.updated_at desc limit 1
  ) pos on true;

  select c.rate_min, c.rate_max, c.currency_code
    into project_rate_min, project_rate_max, project_currency
  from app.project_contract_conditions c
  where c.tenant_id = tenant and c.project_id = p_project_id
    and c.effective_from <= current_date
    and (c.effective_to is null or c.effective_to >= current_date)
  order by c.effective_from desc, c.updated_at desc limit 1;

  select w.prefecture, w.nearest_station, w.remote_type
    into project_prefecture, project_station, project_remote_type
  from app.project_work_conditions w
  where w.tenant_id = tenant and w.project_id = p_project_id
    and w.effective_from <= current_date
    and (w.effective_to is null or w.effective_to >= current_date)
  order by w.effective_from desc, w.updated_at desc limit 1;

  create temporary table match_project_skills (
    skill_key text not null,
    skill_name text not null,
    requirement_type text not null,
    required_months integer,
    weight numeric not null
  ) on commit drop;

  insert into pg_temp.match_project_skills
  select lower(normalize(s.name, NFKC)), s.name, ps.requirement_type,
    max(ps.required_months), max(ps.weight)
  from app.project_skills ps
  join app.skills s on s.id = ps.skill_id
  where ps.tenant_id = tenant and ps.project_id = p_project_id
  group by lower(normalize(s.name, NFKC)), s.name, ps.requirement_type;

  insert into pg_temp.match_project_skills
  select private.match_skill_key(tenant, x.value->>'name'), x.value->>'name', x.kind,
    max(nullif(x.value->>'requiredMonths', '')::integer), 1
  from app.project_extraction_results er
  cross join lateral (
    select value, 'required'::text as kind
    from jsonb_array_elements(coalesce(er.extracted_data->'requiredSkills', '[]'::jsonb))
    union all
    select value, 'preferred'::text
    from jsonb_array_elements(coalesce(er.extracted_data->'preferredSkills', '[]'::jsonb))
  ) x
  where er.tenant_id = tenant and er.project_id = p_project_id
    and er.extraction_status = 'applied'
    and nullif(btrim(x.value->>'name'), '') is not null
    and not exists (
      select 1 from pg_temp.match_project_skills current_skill
      where current_skill.skill_key = private.match_skill_key(tenant, x.value->>'name')
        and current_skill.requirement_type = x.kind
    )
    and er.id = (
      select newest.id from app.project_extraction_results newest
      where newest.tenant_id = tenant and newest.project_id = p_project_id
        and newest.extraction_status = 'applied'
      order by newest.applied_at desc nulls last, newest.created_at desc limit 1
    )
  group by private.match_skill_key(tenant, x.value->>'name'), x.value->>'name', x.kind;

  create temporary table match_engineer_skills (
    engineer_id uuid not null,
    skill_key text not null,
    skill_name text not null,
    experience_months integer
  ) on commit drop;

  insert into pg_temp.match_engineer_skills
  select es.engineer_id, lower(normalize(s.name, NFKC)), s.name,
    max(es.experience_months)
  from app.engineer_skills es
  join app.skills s on s.id = es.skill_id
  join app.engineers e on e.id = es.engineer_id and e.tenant_id = es.tenant_id
  where es.tenant_id = tenant and e.deleted_at is null
    and app.can_access_engineer(e.id, 'engineer.read', 'view')
    and es.verification_status <> 'rejected'
  group by es.engineer_id, lower(normalize(s.name, NFKC)), s.name;

  insert into pg_temp.match_engineer_skills
  select r.engineer_id, private.match_skill_key(tenant, skill.value->>'name'),
    skill.value->>'name', max(nullif(skill.value->>'experienceMonths', '')::integer)
  from app.engineer_resumes r
  join app.engineer_resume_versions v
    on v.tenant_id = r.tenant_id and v.id = r.current_version_id
  cross join lateral jsonb_array_elements(coalesce(v.structured_data->'skills', '[]'::jsonb)) skill(value)
  where r.tenant_id = tenant and r.deleted_at is null and r.resume_status = 'active'
    and nullif(btrim(skill.value->>'name'), '') is not null
    and app.can_access_engineer(r.engineer_id, 'engineer.read', 'view')
    and not exists (
      select 1 from pg_temp.match_engineer_skills current_skill
      where current_skill.engineer_id = r.engineer_id
        and current_skill.skill_key = private.match_skill_key(tenant, skill.value->>'name')
    )
  group by r.engineer_id, private.match_skill_key(tenant, skill.value->>'name'), skill.value->>'name';

  criteria := jsonb_build_object(
    'projectName', target_project.project_name,
    'startOn', project_start,
    'rateMin', project_rate_min,
    'rateMax', project_rate_max,
    'currencyCode', coalesce(project_currency, 'JPY'),
    'prefecture', project_prefecture,
    'nearestStation', project_station,
    'remoteType', project_remote_type,
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', skill_name, 'requirementType', requirement_type,
        'requiredMonths', required_months, 'weight', weight
      ) order by requirement_type, skill_name)
      from pg_temp.match_project_skills
    ), '[]'::jsonb),
    'weights', jsonb_build_object(
      'requiredSkills', 0.50, 'preferredSkills', 0.15,
      'availability', 0.15, 'rate', 0.10, 'location', 0.10
    )
  );

  insert into app.ai_executions(
    tenant_id, execution_type, provider, model_name, prompt_version,
    status, requested_by, started_at, metadata
  ) values (
    tenant, 'match.explain', btrim(p_provider), btrim(p_model_name),
    btrim(p_prompt_version), 'running', auth.uid(), now(),
    jsonb_build_object('project_id', p_project_id, 'calculation_version', 'match.v1')
  ) returning * into execution;

  insert into app.project_engineer_match_runs(
    tenant_id, project_id, project_requirement_version_id, ai_execution_id,
    calculation_version, criteria_snapshot, requested_by
  ) values (
    tenant, p_project_id, target_requirement_version_id, execution.id,
    'match.v1', criteria, auth.uid()
  ) returning * into run;

  create temporary table scored_candidates (
    engineer_id uuid not null,
    resume_version_id uuid,
    overall_score numeric not null,
    required_skill_score numeric not null,
    preferred_skill_score numeric not null,
    availability_score numeric not null,
    rate_score numeric not null,
    location_score numeric not null,
    required_conditions_met boolean not null,
    confidence_score numeric not null,
    matched_skills jsonb not null,
    missing_skills jsonb not null,
    warnings jsonb not null,
    facts_snapshot jsonb not null
  ) on commit drop;

  for candidate in
    select e.*,
      pref.desired_rate_min, pref.desired_rate_max, pref.currency_code as desired_currency,
      pref.remote_preference,
      resume.current_version_id as resume_version_id,
      coalesce(loc.locations, '[]'::jsonb) as preferred_locations
    from app.engineers e
    left join lateral (
      select p.desired_rate_min, p.desired_rate_max, p.currency_code, p.remote_preference
      from app.engineer_preferences p
      where p.tenant_id = e.tenant_id and p.engineer_id = e.id
        and p.effective_from <= current_date
        and (p.effective_to is null or p.effective_to >= current_date)
      order by p.effective_from desc limit 1
    ) pref on true
    left join lateral (
      select r.current_version_id
      from app.engineer_resumes r
      where r.tenant_id = e.tenant_id and r.engineer_id = e.id
        and r.resume_status = 'active' and r.deleted_at is null
      order by r.updated_at desc limit 1
    ) resume on true
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'prefecture', l.prefecture, 'city', l.city, 'stationName', l.station_name
      ) order by l.priority) as locations
      from app.engineer_preferred_locations l
      where l.tenant_id = e.tenant_id and l.engineer_id = e.id
    ) loc on true
    where e.tenant_id = tenant and e.deleted_at is null
      and e.status in ('candidate','active')
      and app.can_access_engineer(e.id, 'engineer.read', 'view')
  loop
    select coalesce(sum(weight), 0),
      coalesce(sum(weight) filter (where exists (
        select 1 from pg_temp.match_engineer_skills es
        where es.engineer_id = candidate.id and es.skill_key = ps.skill_key
          and (ps.required_months is null
            or (es.experience_months is not null and es.experience_months >= ps.required_months))
      )), 0)
    into required_total, required_matched
    from pg_temp.match_project_skills ps where ps.requirement_type = 'required';

    select coalesce(sum(weight), 0),
      coalesce(sum(weight) filter (where exists (
        select 1 from pg_temp.match_engineer_skills es
        where es.engineer_id = candidate.id and es.skill_key = ps.skill_key
          and (ps.required_months is null
            or (es.experience_months is not null and es.experience_months >= ps.required_months))
      )), 0)
    into preferred_total, preferred_matched
    from pg_temp.match_project_skills ps where ps.requirement_type = 'preferred';

    required_score := case when required_total = 0 then 50
      else round(100 * required_matched / required_total, 2) end;
    preferred_score := case when preferred_total = 0 then 50
      else round(100 * preferred_matched / preferred_total, 2) end;

    select coalesce(jsonb_agg(jsonb_build_object(
      'name', ps.skill_name, 'requirementType', ps.requirement_type,
      'requiredMonths', ps.required_months, 'experienceMonths', es.experience_months,
      'reason', null
    ) order by ps.requirement_type, ps.skill_name), '[]'::jsonb)
    into matched
    from pg_temp.match_project_skills ps
    join pg_temp.match_engineer_skills es
      on es.engineer_id = candidate.id and es.skill_key = ps.skill_key
      and (ps.required_months is null
        or (es.experience_months is not null and es.experience_months >= ps.required_months));

    select coalesce(jsonb_agg(jsonb_build_object(
      'name', ps.skill_name, 'requirementType', ps.requirement_type,
      'requiredMonths', ps.required_months,
      'experienceMonths', es.experience_months,
      'reason', case when es.skill_key is null then 'missing'
        else 'insufficient_experience' end
    ) order by ps.skill_name), '[]'::jsonb)
    into missing
    from pg_temp.match_project_skills ps
    left join pg_temp.match_engineer_skills es
      on es.engineer_id = candidate.id and es.skill_key = ps.skill_key
    where ps.requirement_type = 'required'
      and (es.skill_key is null or (ps.required_months is not null
        and (es.experience_months is null or es.experience_months < ps.required_months)));

    availability_score := case candidate.availability_status
      when 'available' then case
        when project_start is null or candidate.available_from is null then 80
        when candidate.available_from <= project_start then 100 else 30 end
      when 'proposed' then 40 when 'engaged' then 20
      when 'unavailable' then 0 else 50 end;

    rate_score := case
      when project_rate_min is null and project_rate_max is null then 50
      when candidate.desired_rate_min is null and candidate.desired_rate_max is null then 50
      when project_currency is not null and candidate.desired_currency is not null
        and project_currency <> candidate.desired_currency then 0
      when coalesce(candidate.desired_rate_min, 0) <= coalesce(project_rate_max, 9223372036854775807)
        and coalesce(candidate.desired_rate_max, 9223372036854775807) >= coalesce(project_rate_min, 0)
        then 100 else 0 end;

    location_score := case
      when project_remote_type = 'remote' then 100
      when project_remote_type = 'hybrid'
        and candidate.remote_preference in ('hybrid','remote','flexible') then 100
      when project_remote_type = 'onsite' and candidate.remote_preference = 'remote' then 0
      when project_prefecture is null and project_station is null then 50
      when jsonb_array_length(candidate.preferred_locations) = 0
        and candidate.nearest_station is null then 50
      when exists (
        select 1 from jsonb_array_elements(candidate.preferred_locations) l
        where (project_prefecture is not null and l->>'prefecture' = project_prefecture)
          or (project_station is not null and l->>'stationName' = project_station)
      ) or (project_station is not null and candidate.nearest_station = project_station)
        then 100 else 0 end;

    overall_score := round(
      required_score * 0.50 + preferred_score * 0.15
      + availability_score * 0.15 + rate_score * 0.10 + location_score * 0.10,
      2
    );
    confidence := round((
      (case when required_total + preferred_total > 0 then 0.30 else 0 end)
      + (case when candidate.availability_status <> 'unknown' then 0.20 else 0 end)
      + (case when (project_rate_min is not null or project_rate_max is not null)
          and (candidate.desired_rate_min is not null or candidate.desired_rate_max is not null)
        then 0.20 else 0 end)
      + (case when project_remote_type = 'remote'
          or ((project_prefecture is not null or project_station is not null)
            and (jsonb_array_length(candidate.preferred_locations) > 0
              or candidate.nearest_station is not null)) then 0.15 else 0 end)
      + (case when exists (select 1 from pg_temp.match_engineer_skills es where es.engineer_id = candidate.id)
        then 0.15 else 0 end)
    )::numeric, 4);

    warning_list := array_remove(array[
      case when required_total = 0 then '案件の構造化スキル要件が不足しています' end,
      case when missing <> '[]'::jsonb then '必須スキルの不足または経験期間不足があります' end,
      case when candidate.availability_status = 'unknown' then '稼働可否が未確認です' end,
      case when candidate.availability_status = 'unavailable' then '現在の稼働状態は稼働不可です' end,
      case when availability_score < 80 then '案件開始時点の稼働条件を満たしていません' end,
      case when project_start is null or candidate.available_from is null then '開始日または稼働可能日が未確認です' end,
      case when rate_score = 50 then '案件単価または希望単価が未確認です' end,
      case when rate_score = 0 then '単価条件が一致しません' end,
      case when location_score = 50 then '勤務地条件または希望勤務地が未確認です' end,
      case when location_score = 0 then '勤務地・リモート条件が一致しません' end,
      case when candidate.resume_version_id is null then '有効な経歴書版がありません' end
    ], null);

    fact := jsonb_build_object(
      'engineerManagementNo', candidate.management_no,
      'engineerName', coalesce(candidate.display_name,
        btrim(candidate.family_name || ' ' || candidate.given_name)),
      'status', candidate.status,
      'availabilityStatus', candidate.availability_status,
      'availableFrom', candidate.available_from,
      'nearestStation', candidate.nearest_station,
      'desiredRateMin', candidate.desired_rate_min,
      'desiredRateMax', candidate.desired_rate_max,
      'currencyCode', candidate.desired_currency,
      'remotePreference', candidate.remote_preference,
      'preferredLocations', candidate.preferred_locations
    );

    insert into pg_temp.scored_candidates values (
      candidate.id, candidate.resume_version_id, overall_score,
      required_score, preferred_score, availability_score, rate_score,
      location_score, required_score = 100 and availability_score >= 80
        and location_score > 0,
      confidence, matched, missing, to_jsonb(warning_list), fact
    );
  end loop;

  insert into app.project_engineer_match_candidates(
    tenant_id, match_run_id, engineer_id, resume_version_id, candidate_rank,
    overall_score, required_skill_score, preferred_skill_score,
    availability_score, rate_score, location_score, required_conditions_met,
    confidence_score, matched_skills, missing_skills, warnings, facts_snapshot
  )
  select tenant, run.id, ranked.engineer_id, ranked.resume_version_id, ranked.candidate_rank,
    ranked.overall_score, ranked.required_skill_score, ranked.preferred_skill_score,
    ranked.availability_score, ranked.rate_score, ranked.location_score,
    ranked.required_conditions_met, ranked.confidence_score,
    ranked.matched_skills, ranked.missing_skills, ranked.warnings, ranked.facts_snapshot
  from (
    select s.*, (row_number() over (
      order by s.required_conditions_met desc, s.overall_score desc,
        s.confidence_score desc, s.engineer_id
    ))::integer as candidate_rank
    from pg_temp.scored_candidates s
  ) ranked
  where ranked.candidate_rank <= p_limit;

  update app.project_engineer_match_runs r set candidate_count = (
    select count(*)::integer from app.project_engineer_match_candidates c
    where c.match_run_id = run.id and c.tenant_id = tenant
  ) where r.id = run.id;

  select jsonb_build_object(
      'criteria', criteria,
      'candidates', coalesce(jsonb_agg(jsonb_build_object(
        'candidateId', c.id,
        'rank', c.candidate_rank,
        'overallScore', c.overall_score,
        'requiredSkillScore', c.required_skill_score,
        'preferredSkillScore', c.preferred_skill_score,
        'availabilityScore', c.availability_score,
        'rateScore', c.rate_score,
        'locationScore', c.location_score,
        'requiredConditionsMet', c.required_conditions_met,
        'confidenceScore', c.confidence_score,
        'matchedSkills', c.matched_skills,
        'missingSkills', c.missing_skills,
        'warnings', c.warnings,
        'facts', c.facts_snapshot
      ) order by c.candidate_rank), '[]'::jsonb)
    ) into match_input
  from app.project_engineer_match_candidates c
  where c.tenant_id = tenant and c.match_run_id = run.id;

  insert into app.ai_execution_inputs(
    tenant_id, ai_execution_id, input_type, content_json,
    source_resource_type, source_resource_id, content_hash
  ) values (
    tenant, execution.id, 'match_facts', match_input, 'project', p_project_id,
    encode(public.digest(convert_to(match_input::text, 'UTF8'), 'sha256'), 'hex')
  );

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type,
    resource_id, request_id, metadata
  ) values (
    tenant, auth.uid(), 'user', 'project.engineer_match_requested',
    'project', p_project_id, nullif(p_request_id, ''),
    jsonb_build_object('match_run_id', run.id, 'ai_execution_id', execution.id,
      'calculation_version', 'match.v1')
  );

  return public.get_project_engineer_match(p_project_id, run.id);
end
$$;

create or replace function public.complete_project_engineer_match(
  p_match_run_id uuid,
  p_ai_execution_id uuid,
  p_explanations jsonb,
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
  run app.project_engineer_match_runs%rowtype;
  explanation_item jsonb;
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('ai.execute')
     or jsonb_typeof(p_explanations) is distinct from 'object'
     or jsonb_typeof(p_explanations->'candidates') is distinct from 'array'
     or jsonb_typeof(p_explanations->'overallSummary') is distinct from 'string'
  then
    raise exception 'project match explanation is invalid' using errcode = '22023';
  end if;

  select r.* into run
  from app.project_engineer_match_runs r
  join app.ai_executions a
    on a.tenant_id = r.tenant_id and a.id = r.ai_execution_id
  where r.tenant_id = tenant and r.id = p_match_run_id
    and r.ai_execution_id = p_ai_execution_id and r.status = 'explaining'
    and a.requested_by = auth.uid() and a.status = 'running'
  for update of r;
  if not found then
    raise exception 'project match is not completable' using errcode = '42501';
  end if;

  if jsonb_array_length(p_explanations->'candidates') <> run.candidate_count
     or exists (
       select 1
       from jsonb_array_elements(p_explanations->'candidates') item
       where jsonb_typeof(item) is distinct from 'object'
         or nullif(item->>'candidateId', '') is null
         or jsonb_typeof(item->'matches') is distinct from 'array'
         or jsonb_typeof(item->'mismatches') is distinct from 'array'
         or jsonb_typeof(item->'missingInformation') is distinct from 'array'
         or jsonb_typeof(item->'warnings') is distinct from 'array'
         or jsonb_typeof(item->'recommendation') is distinct from 'string'
         or jsonb_typeof(item->'questions') is distinct from 'array'
         or not exists (
           select 1 from app.project_engineer_match_candidates c
           where c.tenant_id = tenant and c.match_run_id = run.id
             and c.id = (item->>'candidateId')::uuid
         )
     )
     or (select count(distinct item->>'candidateId')
         from jsonb_array_elements(p_explanations->'candidates') item)
       <> run.candidate_count
  then
    raise exception 'project match candidate explanations are invalid' using errcode = '22023';
  end if;

  for explanation_item in
    select item from jsonb_array_elements(p_explanations->'candidates') item
  loop
    update app.project_engineer_match_candidates set
      explanation = explanation_item - 'candidateId'
    where tenant_id = tenant and match_run_id = run.id
      and id = (explanation_item->>'candidateId')::uuid;
  end loop;

  insert into app.ai_execution_outputs(
    tenant_id, ai_execution_id, output_type, content_json, schema_version
  ) values (
    tenant, p_ai_execution_id, 'match_explanation', p_explanations, 'match.explain.v1'
  );
  update app.ai_executions set
    status = 'succeeded', completed_at = now(), input_tokens = p_input_tokens,
    output_tokens = p_output_tokens
  where tenant_id = tenant and id = p_ai_execution_id;
  update app.project_engineer_match_runs set
    status = 'completed', completed_at = now(), error_message = null,
    overall_summary = p_explanations->>'overallSummary'
  where tenant_id = tenant and id = run.id;

  return public.get_project_engineer_match(run.project_id, run.id);
end
$$;

create or replace function public.fail_project_engineer_match(
  p_match_run_id uuid,
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
    raise exception 'project match is not fail-able' using errcode = '42501';
  end if;
  update app.project_engineer_match_runs r set
    status = 'explanation_failed', completed_at = now(),
    error_message = left(coalesce(p_error_message, 'AI explanation failed'), 2000)
  from app.ai_executions a
  where r.tenant_id = tenant and r.id = p_match_run_id
    and r.ai_execution_id = p_ai_execution_id and r.status = 'explaining'
    and a.tenant_id = tenant and a.id = p_ai_execution_id
    and a.requested_by = auth.uid() and a.status = 'running';
  if not found then return false; end if;
  update app.ai_executions set
    status = 'failed', completed_at = now(),
    error_code = left(coalesce(p_error_code, 'ai_error'), 100),
    error_message = left(coalesce(p_error_message, 'AI explanation failed'), 2000)
  where tenant_id = tenant and id = p_ai_execution_id;
  return true;
end
$$;

revoke all on function public.get_project_engineer_match(uuid,uuid) from public,anon,authenticated;
revoke all on function public.calculate_project_engineer_matches(uuid,integer,text,text,text,text) from public,anon,authenticated;
revoke all on function public.complete_project_engineer_match(uuid,uuid,jsonb,integer,integer) from public,anon,authenticated;
revoke all on function public.fail_project_engineer_match(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.get_project_engineer_match(uuid,uuid) to authenticated;
grant execute on function public.calculate_project_engineer_matches(uuid,integer,text,text,text,text) to authenticated;
grant execute on function public.complete_project_engineer_match(uuid,uuid,jsonb,integer,integer) to authenticated;
grant execute on function public.fail_project_engineer_match(uuid,uuid,text,text) to authenticated;

commit;
