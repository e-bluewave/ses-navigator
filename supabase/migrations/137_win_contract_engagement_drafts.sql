-- SES Navigator
-- Migration: 137_win_contract_engagement_drafts
-- Purpose: Create the engagement core and atomically generate contract and
--          engagement drafts when an offered proposal is won.

begin;

create table app.engagements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  engagement_no varchar(32) not null,
  contract_id uuid not null,
  proposal_id uuid,
  engineer_id uuid not null,
  previous_engagement_id uuid,
  status text not null default 'draft'
    check (status in ('draft','preparing','active','ending','ended','cancelled')),
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  role_name text,
  work_location text,
  remote_frequency text,
  primary_owner_user_id uuid references auth.users(id) on delete set null,
  owner_organization_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id),
  unique (tenant_id, engagement_no),
  foreign key (tenant_id, contract_id)
    references app.contracts(tenant_id, id) on delete restrict,
  foreign key (tenant_id, proposal_id)
    references app.proposals(tenant_id, id) on delete set null,
  foreign key (tenant_id, engineer_id)
    references app.engineers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, previous_engagement_id)
    references app.engagements(tenant_id, id) on delete set null,
  foreign key (tenant_id, owner_organization_id)
    references app.organizations(tenant_id, id)
    on delete set null (owner_organization_id),
  check (planned_end_date is null or planned_start_date is null or planned_end_date >= planned_start_date),
  check (actual_end_date is null or actual_start_date is null or actual_end_date >= actual_start_date),
  check (deleted_at is not null or deleted_by is null)
);

create unique index engagements_proposal_uidx
  on app.engagements(tenant_id, proposal_id)
  where proposal_id is not null and deleted_at is null;
create index engagements_contract_status_idx
  on app.engagements(tenant_id, contract_id, status)
  where deleted_at is null;
create index engagements_engineer_status_idx
  on app.engagements(tenant_id, engineer_id, status)
  where deleted_at is null;
create index engagements_owner_organization_idx
  on app.engagements(tenant_id, owner_organization_id)
  where deleted_at is null and owner_organization_id is not null;

create table app.engagement_status_histories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  engagement_id uuid not null,
  from_status text,
  to_status text not null
    check (to_status in ('draft','preparing','active','ending','ended','cancelled')),
  change_reason text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  foreign key (tenant_id, engagement_id)
    references app.engagements(tenant_id, id) on delete cascade
);

create index engagement_status_histories_engagement_idx
  on app.engagement_status_histories(tenant_id, engagement_id, changed_at desc);

create table app.engagement_conditions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  engagement_id uuid not null,
  version_no integer not null,
  effective_from date not null,
  effective_to date,
  monthly_sales_amount numeric(14,2),
  monthly_cost_amount numeric(14,2),
  currency char(3) not null default 'JPY',
  settlement_lower_hours numeric(8,2),
  settlement_upper_hours numeric(8,2),
  work_location text,
  remote_frequency text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  unique (tenant_id, engagement_id, version_no),
  foreign key (tenant_id, engagement_id)
    references app.engagements(tenant_id, id) on delete cascade,
  check (version_no > 0),
  check (effective_to is null or effective_to >= effective_from),
  check (monthly_sales_amount is null or monthly_sales_amount >= 0),
  check (monthly_cost_amount is null or monthly_cost_amount >= 0),
  check (settlement_upper_hours is null or settlement_lower_hours is null or settlement_upper_hours >= settlement_lower_hours)
);

create index engagement_conditions_engagement_idx
  on app.engagement_conditions(tenant_id, engagement_id, version_no desc);

select app.attach_updated_at_trigger('app.engagements'::regclass);
select app.attach_row_version_trigger('app.engagements'::regclass);

create or replace function app.can_access_engagement(
  required_engagement_id uuid,
  required_permission text,
  required_share_level text default 'view'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from app.engagements e
    where e.id = required_engagement_id
      and e.deleted_at is null
      and app.can_access_owned_record(
        e.tenant_id,
        'engagement',
        e.id,
        e.primary_owner_user_id,
        e.owner_organization_id,
        required_permission,
        required_share_level
      )
      and app.can_access_contract(
        e.contract_id,
        required_permission,
        required_share_level
      )
  );
$$;

revoke all on function app.can_access_engagement(uuid, text, text)
  from public, anon, authenticated;
grant execute on function app.can_access_engagement(uuid, text, text)
  to authenticated, service_role;

create or replace function app.can_access_resource(
  required_resource_type text,
  required_resource_id uuid,
  required_permission text,
  required_share_level text default 'view'
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  return case required_resource_type
    when 'company' then app.can_access_company(
      required_resource_id, required_permission, required_share_level
    )
    when 'company_contact' then app.can_access_company_contact(
      required_resource_id, required_permission, required_share_level
    )
    when 'engineer' then app.can_access_engineer(
      required_resource_id, required_permission, required_share_level
    )
    when 'project' then app.can_access_project(
      required_resource_id, required_permission, required_share_level
    )
    when 'proposal' then app.can_access_proposal(
      required_resource_id, required_permission, required_share_level
    )
    when 'contract' then app.can_access_contract(
      required_resource_id, required_permission, required_share_level
    )
    when 'engagement' then app.can_access_engagement(
      required_resource_id, required_permission, required_share_level
    )
    when 'invoice' then app.can_access_invoice(
      required_resource_id, required_permission, required_share_level
    )
    when 'task' then app.can_access_task(
      required_resource_id, required_permission, required_share_level
    )
    when 'interview' then app.can_access_interview(
      required_resource_id, required_permission, required_share_level
    )
    when 'outbound_message' then app.can_access_outbound_message(
      required_resource_id, required_permission, required_share_level
    )
    else false
  end;
end;
$$;

-- The migration-only policy installer from migration 112 is deliberately
-- dropped before that migration commits. These new tables therefore install
-- their equivalent policies explicitly instead of depending on that helper.
alter table app.engagements enable row level security;
alter table app.engagements force row level security;

create policy authorization_select
  on app.engagements
  for select
  to authenticated
  using (
    deleted_at is null
    and app.can_access_engagement(id, 'contract.read', 'view')
  );

create policy authorization_insert
  on app.engagements
  for insert
  to authenticated
  with check (
    tenant_id = app.current_tenant_id()
    and created_by = auth.uid()
    and app.can_access_contract(contract_id, 'contract.manage', 'edit')
  );

create policy authorization_update
  on app.engagements
  for update
  to authenticated
  using (
    deleted_at is null
    and app.can_access_engagement(id, 'contract.manage', 'edit')
  )
  with check (
    deleted_at is null
    and app.can_access_engagement(id, 'contract.manage', 'edit')
  );

alter table app.engagement_status_histories enable row level security;
alter table app.engagement_status_histories force row level security;

create policy authorization_select
  on app.engagement_status_histories
  for select
  to authenticated
  using (
    app.can_access_engagement(engagement_id, 'contract.read', 'view')
  );

create policy authorization_insert
  on app.engagement_status_histories
  for insert
  to authenticated
  with check (
    app.can_access_engagement(engagement_id, 'contract.manage', 'edit')
  );

create policy authorization_update
  on app.engagement_status_histories
  for update
  to authenticated
  using (
    app.can_access_engagement(engagement_id, 'contract.manage', 'edit')
  )
  with check (
    app.can_access_engagement(engagement_id, 'contract.manage', 'edit')
  );

alter table app.engagement_conditions enable row level security;
alter table app.engagement_conditions force row level security;

create policy authorization_select
  on app.engagement_conditions
  for select
  to authenticated
  using (
    app.can_access_engagement(engagement_id, 'contract.read', 'view')
  );

create policy authorization_insert
  on app.engagement_conditions
  for insert
  to authenticated
  with check (
    app.can_access_engagement(engagement_id, 'contract.manage', 'edit')
  );

create policy authorization_update
  on app.engagement_conditions
  for update
  to authenticated
  using (
    app.can_access_engagement(engagement_id, 'contract.manage', 'edit')
  )
  with check (
    app.can_access_engagement(engagement_id, 'contract.manage', 'edit')
  );

create or replace function public.win_proposal_and_create_drafts(
  p_proposal_id uuid,
  p_row_version bigint,
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
  engineer app.engineers%rowtype;
  condition app.project_contract_conditions%rowtype;
  contract_row app.contracts%rowtype;
  engagement app.engagements%rowtype;
  idempotency app.idempotency_records%rowtype;
  contract_result jsonb;
  result jsonb;
  parties jsonb;
  v_contract_type text;
  v_contract_no text;
  v_engagement_no text;
  v_title text;
  v_start_date date;
  v_end_date date;
begin
  if auth.uid() is null or tenant is null or p_proposal_id is null
     or p_row_version is null or p_row_version < 1
     or nullif(btrim(p_request_id), '') is null
     or length(coalesce(p_request_id, '')) > 200
  then
    raise exception 'invalid proposal win request' using errcode = '22023';
  end if;

  insert into app.idempotency_records(
    tenant_id, actor_type, actor_id, operation_name, idempotency_key,
    request_hash, locked_until, expires_at
  ) values (
    tenant, 'user', auth.uid()::text, 'proposal.win', p_request_id,
    p_proposal_id::text || ':' || p_row_version::text,
    statement_timestamp() + interval '5 minutes',
    statement_timestamp() + interval '7 days'
  )
  on conflict (tenant_id, actor_type, actor_id, operation_name, idempotency_key)
  do nothing;

  select i.* into idempotency
  from app.idempotency_records i
  where i.tenant_id = tenant
    and i.actor_type = 'user'
    and i.actor_id = auth.uid()::text
    and i.operation_name = 'proposal.win'
    and i.idempotency_key = p_request_id
  for update;

  if idempotency.request_hash <> (p_proposal_id::text || ':' || p_row_version::text) then
    raise exception 'idempotency key was already used for another request'
      using errcode = '22023';
  end if;
  if idempotency.completed_at is not null then
    return idempotency.response_body;
  end if;

  select p.* into target
  from app.proposals p
  where p.id = p_proposal_id
    and p.tenant_id = tenant
    and p.deleted_at is null
    and app.can_access_proposal(p.id, 'proposal.manage', 'edit')
  for update;

  if not found then return null; end if;

  if target.status = 'won' then
    select c.* into contract_row
    from app.contracts c
    where c.tenant_id = tenant and c.proposal_id = target.id and c.deleted_at is null
    order by c.created_at, c.id
    limit 1;
    select e.* into engagement
    from app.engagements e
    where e.tenant_id = tenant and e.proposal_id = target.id and e.deleted_at is null
    order by e.created_at, e.id
    limit 1;

    if contract_row.id is null or engagement.id is null then
      raise exception 'won proposal draft records are incomplete' using errcode = '55000';
    end if;

    result := jsonb_build_object(
      'proposal', to_jsonb(target) - array['tenant_id','primary_owner_user_id','owner_organization_id','created_by','updated_by','deleted_at','deleted_by','delete_reason'],
      'contract_id', contract_row.id,
      'engagement_id', engagement.id,
      'created', false
    );
    update app.idempotency_records
    set response_status = 200, response_body = result,
        completed_at = statement_timestamp(), locked_until = null
    where id = idempotency.id;
    return result;
  end if;

  if target.status <> 'offered' or target.row_version <> p_row_version then
    return null;
  end if;

  select pp.* into position
  from app.project_positions pp
  where pp.id = target.project_position_id
    and pp.tenant_id = tenant
    and pp.deleted_at is null;
  if not found then return null; end if;

  select p.* into project
  from app.projects p
  where p.id = position.project_id
    and p.tenant_id = tenant
    and p.deleted_at is null;
  if not found
     or not app.has_permission('contract.manage', project.owner_organization_id)
  then
    return null;
  end if;

  select e.* into engineer
  from app.engineers e
  where e.id = target.engineer_id
    and e.tenant_id = tenant
    and e.deleted_at is null;
  if not found then return null; end if;

  select pc.* into condition
  from app.project_contract_conditions pc
  where pc.tenant_id = tenant
    and pc.project_id = project.id
    and (pc.project_position_id is null or pc.project_position_id = position.id)
    and pc.effective_from <= current_date
    and (pc.effective_to is null or pc.effective_to >= current_date)
  order by (pc.project_position_id is not null) desc, pc.effective_from desc, pc.id desc
  limit 1;

  v_contract_type := case
    when condition.contract_type in ('ses','dispatch','subcontract','quasi_mandate','fixed_price','other')
      then condition.contract_type
    else 'ses'
  end;
  v_contract_no := 'CON-' || left(target.management_no, 20) || '-' || left(replace(target.id::text, '-', ''), 7);
  v_engagement_no := 'ENG-' || left(target.management_no, 20) || '-' || left(replace(target.id::text, '-', ''), 7);
  v_title := project.project_name || ' / ' || coalesce(
    nullif(engineer.display_name, ''),
    concat_ws(' ', engineer.family_name, engineer.given_name)
  );
  v_start_date := coalesce(
    target.proposed_start_date,
    position.desired_start_date,
    position.start_date,
    project.planned_start_on,
    current_date
  );
  v_end_date := coalesce(position.end_date, project.planned_end_on);
  if v_end_date is not null and v_end_date < v_start_date then
    v_end_date := null;
  end if;

  update app.proposals
  set status = 'won', updated_by = auth.uid()
  where id = target.id
  returning * into saved;

  insert into app.proposal_status_histories(
    tenant_id, proposal_id, from_status, to_status, change_reason, changed_by, metadata
  ) values (
    tenant, saved.id, target.status, saved.status,
    'Contract and engagement drafts generated', auth.uid(),
    jsonb_build_object('request_id', nullif(p_request_id, ''))
  );

  insert into app.proposal_outcomes(
    tenant_id, proposal_id, outcome_type, recorded_by,
    source_company_id, source_contact_id, metadata
  ) values (
    tenant, saved.id, 'won', auth.uid(),
    saved.destination_company_id, saved.destination_contact_id,
    jsonb_build_object('request_id', nullif(p_request_id, ''))
  );

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'proposal.status_changed', 'proposal', saved.id,
    nullif(p_request_id, ''),
    jsonb_build_object('status', target.status, 'row_version', target.row_version),
    jsonb_build_object('status', saved.status, 'row_version', saved.row_version),
    jsonb_build_object('draft_generation', true)
  );

  parties := jsonb_build_array(jsonb_build_object(
    'company_id', saved.destination_company_id,
    'contact_id', saved.destination_contact_id,
    'party_role', 'customer',
    'billing_role', 'bill_to',
    'is_primary', true,
    'notes', 'Generated from won proposal'
  ));
  if project.primary_customer_company_id is not null
     and project.primary_customer_company_id <> saved.destination_company_id
     and exists (
       select 1 from app.companies c
       where c.id = project.primary_customer_company_id
         and c.tenant_id = tenant
         and c.deleted_at is null
         and app.can_access_company(c.id, 'company.read', 'view')
     )
  then
    parties := parties || jsonb_build_array(jsonb_build_object(
      'company_id', project.primary_customer_company_id,
      'contact_id', null,
      'party_role', 'end_client',
      'billing_role', 'none',
      'is_primary', false,
      'notes', 'Generated from project primary customer'
    ));
  end if;

  contract_result := public.save_contract(
    null,
    0,
    jsonb_build_object(
      'contract_no', v_contract_no,
      'project_id', project.id,
      'proposal_id', saved.id,
      'engineer_id', saved.engineer_id,
      'contract_type', v_contract_type,
      'title', v_title,
      'start_date', v_start_date,
      'end_date', v_end_date,
      'auto_renew', false,
      'currency', saved.currency_code,
      'monthly_amount', saved.proposed_unit_price,
      'hourly_amount', null,
      'settlement_lower_hours', condition.settlement_lower_hours,
      'settlement_upper_hours', condition.settlement_upper_hours,
      'payment_terms', case when condition.payment_terms_days is null then null else condition.payment_terms_days || ' days' end,
      'notes', 'Draft generated automatically from proposal ' || saved.management_no
    ),
    parties,
    'Initial draft generated from won proposal',
    p_request_id
  );

  if contract_result is null then
    raise exception 'contract draft generation failed' using errcode = '55000';
  end if;

  select c.* into contract_row
  from app.contracts c
  where c.id = (contract_result->>'id')::uuid
    and c.tenant_id = tenant;
  if not found then
    raise exception 'contract draft generation failed' using errcode = '55000';
  end if;

  insert into app.engagements(
    tenant_id, engagement_no, contract_id, proposal_id, engineer_id,
    status, planned_start_date, planned_end_date, role_name,
    primary_owner_user_id, owner_organization_id, created_by, updated_by
  ) values (
    tenant, v_engagement_no, contract_row.id, saved.id, saved.engineer_id,
    'draft', v_start_date, v_end_date, position.role_name,
    saved.primary_owner_user_id, saved.owner_organization_id, auth.uid(), auth.uid()
  ) returning * into engagement;

  insert into app.engagement_status_histories(
    tenant_id, engagement_id, from_status, to_status,
    change_reason, changed_by, metadata
  ) values (
    tenant, engagement.id, null, 'draft',
    'Generated from won proposal', auth.uid(),
    jsonb_build_object('proposal_id', saved.id, 'contract_id', contract_row.id, 'request_id', nullif(p_request_id, ''))
  );

  insert into app.engagement_conditions(
    tenant_id, engagement_id, version_no, effective_from, effective_to,
    monthly_sales_amount, currency, settlement_lower_hours,
    settlement_upper_hours, notes, created_by
  ) values (
    tenant, engagement.id, 1, v_start_date, v_end_date,
    saved.proposed_unit_price, saved.currency_code,
    condition.settlement_lower_hours, condition.settlement_upper_hours,
    'Initial condition generated from won proposal', auth.uid()
  );

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'engagement.created', 'engagement', engagement.id,
    nullif(p_request_id, ''),
    jsonb_build_object(
      'engagement_no', engagement.engagement_no,
      'status', engagement.status,
      'row_version', engagement.row_version
    ),
    jsonb_build_object('proposal_id', saved.id, 'contract_id', contract_row.id, 'draft_generation', true)
  );

  result := jsonb_build_object(
    'proposal', to_jsonb(saved) - array['tenant_id','primary_owner_user_id','owner_organization_id','created_by','updated_by','deleted_at','deleted_by','delete_reason'],
    'contract_id', contract_row.id,
    'engagement_id', engagement.id,
    'created', true
  );
  update app.idempotency_records
  set response_status = 200, response_body = result,
      completed_at = statement_timestamp(), locked_until = null
  where id = idempotency.id;
  return result;
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
  win_result jsonb;
begin
  if auth.uid() is null or tenant is null or p_proposal_id is null
     or p_row_version is null or p_row_version < 1
     or p_to_status not in ('draft','pending_approval','approved','sent','interview_requested','interviewing','offered','won','lost','withdrawn','cancelled')
     or length(coalesce(reason, '')) > 500
     or (p_to_status in ('lost','withdrawn','cancelled') and reason is null)
  then
    raise exception 'invalid proposal status request' using errcode = '22023';
  end if;

  if p_to_status = 'won' then
    win_result := public.win_proposal_and_create_drafts(
      p_proposal_id,
      p_row_version,
      p_request_id
    );
    return win_result->'proposal';
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
    or (target.status = 'offered' and p_to_status in ('lost','withdrawn','cancelled'))
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

revoke all on function public.win_proposal_and_create_drafts(uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.win_proposal_and_create_drafts(uuid, bigint, text)
  to authenticated;

grant all privileges on table
  app.engagements,
  app.engagement_status_histories,
  app.engagement_conditions
to service_role;

comment on table app.engagements is
  'Independent engagement periods under a contract; re-entry creates a new row instead of reopening history.';
comment on function app.can_access_engagement(uuid, text, text) is
  'Checks engagement ownership and its parent contract authorization boundary.';
comment on function public.win_proposal_and_create_drafts(uuid, bigint, text) is
  'Atomically wins an offered proposal and creates one editable contract draft and initial engagement draft; retries return existing drafts.';
comment on function public.transition_proposal_status(uuid, bigint, text, text, text) is
  'Applies authorized proposal transitions; won is delegated to atomic contract and engagement draft generation.';

commit;
