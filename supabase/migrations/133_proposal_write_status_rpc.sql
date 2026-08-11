-- SES Navigator
-- Migration: 133_proposal_write_status_rpc
-- Purpose: Save draft proposals and apply authorized proposal status transitions atomically.

begin;

create or replace function public.save_proposal(
  p_proposal_id uuid,
  p_row_version bigint,
  p_proposal jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  target app.proposals%rowtype;
  saved app.proposals%rowtype;
  position app.project_positions%rowtype;
  project app.projects%rowtype;
  v_engineer_id uuid;
  v_destination_company_id uuid;
  v_destination_contact_id uuid;
  v_resume_version_id uuid;
  v_requirement_version_id uuid;
  v_proposed_unit_price numeric(15,2);
  v_proposed_start_date date;
  v_validity_date date;
  v_management_no text;
  v_currency_code text;
begin
  if auth.uid() is null
     or tenant is null
     or p_row_version is null
     or p_row_version < 0
     or jsonb_typeof(p_proposal) <> 'object'
  then
    raise exception 'invalid proposal save request' using errcode = '22023';
  end if;

  begin
    v_management_no := btrim(p_proposal->>'management_no');
    v_engineer_id := (p_proposal->>'engineer_id')::uuid;
    v_destination_company_id := (p_proposal->>'destination_company_id')::uuid;
    v_destination_contact_id := nullif(p_proposal->>'destination_contact_id', '')::uuid;
    v_resume_version_id := nullif(p_proposal->>'resume_version_id', '')::uuid;
    v_requirement_version_id := nullif(p_proposal->>'requirement_version_id', '')::uuid;
    v_proposed_unit_price := nullif(p_proposal->>'proposed_unit_price', '')::numeric;
    v_proposed_start_date := nullif(p_proposal->>'proposed_start_date', '')::date;
    v_validity_date := nullif(p_proposal->>'validity_date', '')::date;
    v_currency_code := upper(btrim(coalesce(p_proposal->>'currency_code', 'JPY')));
  exception when others then
    raise exception 'invalid proposal fields' using errcode = '22023';
  end;

  if v_management_no is null or length(v_management_no) not between 1 and 32
     or v_engineer_id is null or v_destination_company_id is null
     or v_currency_code !~ '^[A-Z]{3}$'
     or v_proposed_unit_price < 0
  then
    raise exception 'invalid proposal fields' using errcode = '22023';
  end if;

  select pp.* into position
  from app.project_positions pp
  where pp.id = (p_proposal->>'project_position_id')::uuid
    and pp.tenant_id = tenant
    and pp.deleted_at is null;

  if not found then return null; end if;

  select p.* into project
  from app.projects p
  where p.id = position.project_id
    and p.tenant_id = tenant
    and p.deleted_at is null
    and app.can_access_project(p.id, 'project.read', 'view');

  if not found
     or not app.has_permission('proposal.manage', project.owner_organization_id)
     or not exists (
       select 1 from app.engineers e
       where e.id = v_engineer_id and e.tenant_id = tenant and e.deleted_at is null
         and app.can_access_engineer(e.id, 'engineer.read', 'view')
     )
     or not exists (
       select 1 from app.companies c
       where c.id = v_destination_company_id and c.tenant_id = tenant and c.deleted_at is null
         and app.can_access_company(c.id, 'company.read', 'view')
     )
     or (v_destination_contact_id is not null and not exists (
       select 1 from app.company_contacts c
       where c.id = v_destination_contact_id and c.tenant_id = tenant
         and c.company_id = v_destination_company_id and c.deleted_at is null
     ))
     or (v_resume_version_id is not null and not exists (
       select 1
       from app.engineer_resume_versions v
       join app.engineer_resumes r on r.id = v.resume_id and r.tenant_id = v.tenant_id
       where v.id = v_resume_version_id and v.tenant_id = tenant
         and r.engineer_id = v_engineer_id and r.deleted_at is null
     ))
     or (v_requirement_version_id is not null and not exists (
       select 1
       from app.project_requirement_versions v
       join app.project_requirements r on r.id = v.project_requirement_id and r.tenant_id = v.tenant_id
       where v.id = v_requirement_version_id and v.tenant_id = tenant
         and r.project_id = position.project_id and r.deleted_at is null
         and (r.project_position_id is null or r.project_position_id = position.id)
     ))
  then
    return null;
  end if;

  if p_proposal_id is null then
    if p_row_version <> 0 then return null; end if;
    insert into app.proposals(
      tenant_id, management_no, project_position_id, engineer_id,
      destination_company_id, destination_contact_id, resume_version_id,
      requirement_version_id, proposed_unit_price, currency_code,
      proposed_start_date, validity_date, status, primary_owner_user_id,
      owner_organization_id, created_by, updated_by
    ) values (
      tenant, v_management_no, position.id, v_engineer_id,
      v_destination_company_id, v_destination_contact_id, v_resume_version_id,
      v_requirement_version_id, v_proposed_unit_price, v_currency_code,
      v_proposed_start_date, v_validity_date, 'draft', auth.uid(),
      project.owner_organization_id, auth.uid(), auth.uid()
    ) returning * into saved;

    insert into app.proposal_status_histories(
      tenant_id, proposal_id, from_status, to_status, change_reason, changed_by, metadata
    ) values (
      tenant, saved.id, null, 'draft', 'Proposal created', auth.uid(),
      jsonb_build_object('request_id', nullif(p_request_id, ''))
    );
    insert into app.proposal_snapshots(tenant_id, proposal_id, snapshot_type, snapshot_data, created_by)
    values (tenant, saved.id, 'created', to_jsonb(saved) - array['tenant_id','deleted_at','deleted_by','delete_reason'], auth.uid());
    insert into audit.audit_logs(
      tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
      request_id, after_data, metadata
    ) values (
      tenant, auth.uid(), 'user', 'proposal.created', 'proposal', saved.id,
      nullif(p_request_id, ''),
      jsonb_build_object('management_no', saved.management_no, 'status', saved.status, 'row_version', saved.row_version),
      jsonb_build_object('project_position_id', saved.project_position_id, 'engineer_id', saved.engineer_id)
    );
  else
    select p.* into target
    from app.proposals p
    where p.id = p_proposal_id
      and p.tenant_id = tenant
      and p.deleted_at is null
      and app.can_access_proposal(p.id, 'proposal.manage', 'edit')
    for update;

    if not found or target.row_version <> p_row_version or target.status <> 'draft' then
      return null;
    end if;

    update app.proposals
    set management_no = v_management_no,
        project_position_id = position.id,
        engineer_id = v_engineer_id,
        destination_company_id = v_destination_company_id,
        destination_contact_id = v_destination_contact_id,
        resume_version_id = v_resume_version_id,
        requirement_version_id = v_requirement_version_id,
        proposed_unit_price = v_proposed_unit_price,
        currency_code = v_currency_code,
        proposed_start_date = v_proposed_start_date,
        validity_date = v_validity_date,
        owner_organization_id = project.owner_organization_id,
        updated_by = auth.uid()
    where id = target.id
    returning * into saved;

    insert into audit.audit_logs(
      tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
      request_id, before_data, after_data
    ) values (
      tenant, auth.uid(), 'user', 'proposal.updated', 'proposal', saved.id,
      nullif(p_request_id, ''),
      jsonb_build_object('management_no', target.management_no, 'status', target.status, 'row_version', target.row_version),
      jsonb_build_object('management_no', saved.management_no, 'status', saved.status, 'row_version', saved.row_version)
    );
  end if;

  return to_jsonb(saved) - array['tenant_id','primary_owner_user_id','owner_organization_id','created_by','updated_by','deleted_at','deleted_by','delete_reason'];
end
$$;

create or replace function public.transition_proposal_status(
  p_proposal_id uuid,
  p_row_version bigint,
  p_to_status text,
  p_change_reason text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  target app.proposals%rowtype;
  saved app.proposals%rowtype;
  snapshot_type text;
  outcome_type text;
  reason text := nullif(btrim(p_change_reason), '');
begin
  if auth.uid() is null or tenant is null or p_proposal_id is null
     or p_row_version is null or p_row_version < 1
     or p_to_status not in ('draft','pending_approval','approved','sent','interview_requested','interviewing','offered','won','lost','withdrawn','cancelled')
     or length(coalesce(reason, '')) > 500
     or (p_to_status in ('lost','withdrawn','cancelled') and reason is null)
  then
    raise exception 'invalid proposal status request' using errcode = '22023';
  end if;

  select p.* into target
  from app.proposals p
  where p.id = p_proposal_id
    and p.tenant_id = tenant
    and p.deleted_at is null
    and app.can_access_proposal(
      p.id,
      case when p.status = 'approved' and p_to_status = 'sent'
        then 'proposal.send' else 'proposal.manage' end,
      'edit'
    )
  for update;

  if not found or target.row_version <> p_row_version then return null; end if;

  if not (
    (target.status = 'draft' and p_to_status in ('pending_approval','cancelled'))
    or (target.status = 'pending_approval' and p_to_status in ('draft','approved','cancelled'))
    or (target.status = 'approved' and p_to_status in ('draft','sent','cancelled'))
    or (target.status = 'sent' and p_to_status in ('interview_requested','lost','withdrawn','cancelled'))
    or (target.status = 'interview_requested' and p_to_status in ('interviewing','lost','withdrawn','cancelled'))
    or (target.status = 'interviewing' and p_to_status in ('offered','lost','withdrawn','cancelled'))
    or (target.status = 'offered' and p_to_status in ('won','lost','withdrawn','cancelled'))
  ) then
    return null;
  end if;

  update app.proposals
  set status = p_to_status, updated_by = auth.uid()
  where id = target.id
  returning * into saved;

  insert into app.proposal_status_histories(
    tenant_id, proposal_id, from_status, to_status, change_reason, changed_by, metadata
  ) values (
    tenant, saved.id, target.status, saved.status, reason, auth.uid(),
    jsonb_build_object('request_id', nullif(p_request_id, ''))
  );

  snapshot_type := case saved.status
    when 'pending_approval' then 'submitted'
    when 'approved' then 'approved'
    when 'sent' then 'sent'
    when 'draft' then 'corrected'
    else null
  end;
  if snapshot_type is not null then
    insert into app.proposal_snapshots(tenant_id, proposal_id, snapshot_type, snapshot_data, created_by)
    values (tenant, saved.id, snapshot_type, to_jsonb(saved) - array['tenant_id','deleted_at','deleted_by','delete_reason'], auth.uid());
  end if;

  outcome_type := case saved.status
    when 'interview_requested' then 'interview_requested'
    when 'offered' then 'offered'
    when 'won' then 'won'
    when 'lost' then 'lost'
    when 'withdrawn' then 'withdrawn'
    when 'cancelled' then 'cancelled'
    else null
  end;
  if outcome_type is not null then
    insert into app.proposal_outcomes(
      tenant_id, proposal_id, outcome_type, reason_detail, recorded_by,
      source_company_id, source_contact_id, metadata
    ) values (
      tenant, saved.id, outcome_type, reason, auth.uid(),
      saved.destination_company_id, saved.destination_contact_id,
      jsonb_build_object('request_id', nullif(p_request_id, ''))
    );
  end if;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'proposal.status_changed', 'proposal', saved.id,
    nullif(p_request_id, ''),
    jsonb_build_object('status', target.status, 'row_version', target.row_version),
    jsonb_build_object('status', saved.status, 'row_version', saved.row_version),
    jsonb_build_object('change_reason', reason)
  );

  return to_jsonb(saved) - array['tenant_id','primary_owner_user_id','owner_organization_id','created_by','updated_by','deleted_at','deleted_by','delete_reason'];
end
$$;

revoke all on function public.save_proposal(uuid, bigint, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.transition_proposal_status(uuid, bigint, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_proposal(uuid, bigint, jsonb, text)
  to authenticated;
grant execute on function public.transition_proposal_status(uuid, bigint, text, text, text)
  to authenticated;

comment on function public.save_proposal(uuid, bigint, jsonb, text) is
  'Creates or updates one authorized draft proposal with reference validation, optimistic locking, snapshots, and audit.';
comment on function public.transition_proposal_status(uuid, bigint, text, text, text) is
  'Applies an authorized proposal workflow transition with optimistic locking, history, milestone snapshots, outcomes, and audit.';

commit;
