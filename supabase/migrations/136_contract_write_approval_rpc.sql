-- SES Navigator
-- Migration: 136_contract_write_approval_rpc
-- Purpose: Save draft contracts and apply authorized review decisions atomically.

begin;

create or replace function public.save_contract(
  p_contract_id uuid,
  p_row_version bigint,
  p_contract jsonb,
  p_parties jsonb,
  p_change_summary text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  target app.contracts%rowtype;
  saved app.contracts%rowtype;
  proposal app.proposals%rowtype;
  position app.project_positions%rowtype;
  project app.projects%rowtype;
  party jsonb;
  v_contract_no text;
  v_project_id uuid;
  v_proposal_id uuid;
  v_engineer_id uuid;
  v_contract_type text;
  v_title text;
  v_start_date date;
  v_end_date date;
  v_auto_renew boolean;
  v_currency text;
  v_monthly_amount numeric(14,2);
  v_hourly_amount numeric(14,2);
  v_settlement_lower numeric(8,2);
  v_settlement_upper numeric(8,2);
  v_payment_terms text;
  v_notes text;
  v_company_id uuid;
  v_contact_id uuid;
  v_party_role text;
  v_billing_role text;
  v_is_primary boolean;
  v_change_summary text := nullif(btrim(p_change_summary), '');
  v_version_no integer;
  v_contract_data jsonb;
begin
  if auth.uid() is null
     or tenant is null
     or p_row_version is null
     or p_row_version < 0
     or p_contract is null
     or p_parties is null
     or jsonb_typeof(p_contract) <> 'object'
     or jsonb_typeof(p_parties) <> 'array'
     or jsonb_array_length(p_parties) > 20
     or length(coalesce(v_change_summary, '')) > 1000
  then
    raise exception 'invalid contract save request' using errcode = '22023';
  end if;

  begin
    v_contract_no := btrim(p_contract->>'contract_no');
    v_project_id := nullif(p_contract->>'project_id', '')::uuid;
    v_proposal_id := nullif(p_contract->>'proposal_id', '')::uuid;
    v_engineer_id := nullif(p_contract->>'engineer_id', '')::uuid;
    v_contract_type := btrim(p_contract->>'contract_type');
    v_title := btrim(p_contract->>'title');
    v_start_date := (p_contract->>'start_date')::date;
    v_end_date := nullif(p_contract->>'end_date', '')::date;
    v_auto_renew := coalesce((p_contract->>'auto_renew')::boolean, false);
    v_currency := upper(btrim(coalesce(p_contract->>'currency', 'JPY')));
    v_monthly_amount := nullif(p_contract->>'monthly_amount', '')::numeric;
    v_hourly_amount := nullif(p_contract->>'hourly_amount', '')::numeric;
    v_settlement_lower := nullif(p_contract->>'settlement_lower_hours', '')::numeric;
    v_settlement_upper := nullif(p_contract->>'settlement_upper_hours', '')::numeric;
    v_payment_terms := nullif(btrim(p_contract->>'payment_terms'), '');
    v_notes := nullif(btrim(p_contract->>'notes'), '');
  exception when others then
    raise exception 'invalid contract fields' using errcode = '22023';
  end;

  if v_contract_no is null or length(v_contract_no) not between 1 and 32
     or v_contract_type is null
     or v_contract_type not in ('ses','dispatch','subcontract','quasi_mandate','fixed_price','other')
     or v_title is null or length(v_title) not between 1 and 300
     or v_start_date is null
     or (v_end_date is not null and v_end_date < v_start_date)
     or v_currency !~ '^[A-Z]{3}$'
     or v_monthly_amount < 0 or v_hourly_amount < 0
     or v_settlement_lower < 0 or v_settlement_upper < 0
     or (v_settlement_lower is not null and v_settlement_upper is not null and v_settlement_upper < v_settlement_lower)
     or length(coalesce(v_payment_terms, '')) > 1000
     or length(coalesce(v_notes, '')) > 5000
  then
    raise exception 'invalid contract fields' using errcode = '22023';
  end if;

  if v_proposal_id is not null then
    select p.* into proposal
    from app.proposals p
    where p.id = v_proposal_id
      and p.tenant_id = tenant
      and p.deleted_at is null
      and p.status = 'won'
      and app.can_access_proposal(p.id, 'proposal.read', 'view');
    if not found then return null; end if;

    select pp.* into position
    from app.project_positions pp
    where pp.id = proposal.project_position_id
      and pp.tenant_id = tenant
      and pp.deleted_at is null;
    if not found then return null; end if;

    if v_project_id is not null and v_project_id <> position.project_id then return null; end if;
    if v_engineer_id is not null and v_engineer_id <> proposal.engineer_id then return null; end if;
    v_project_id := position.project_id;
    v_engineer_id := proposal.engineer_id;
  end if;

  if v_project_id is null then
    raise exception 'project_id or a won proposal_id is required' using errcode = '22023';
  end if;

  select p.* into project
  from app.projects p
  where p.id = v_project_id
    and p.tenant_id = tenant
    and p.deleted_at is null
    and app.can_access_project(p.id, 'project.read', 'view');

  if not found
     or not app.has_permission('contract.manage', project.owner_organization_id)
     or (v_engineer_id is not null and not exists (
       select 1 from app.engineers e
       where e.id = v_engineer_id and e.tenant_id = tenant and e.deleted_at is null
         and app.can_access_engineer(e.id, 'engineer.read', 'view')
     ))
  then
    return null;
  end if;

  if exists (
    select 1 from app.contracts c
    where c.tenant_id = tenant
      and c.contract_no = v_contract_no
      and (p_contract_id is null or c.id <> p_contract_id)
  ) then
    return null;
  end if;

  if p_contract_id is null then
    if p_row_version <> 0 then return null; end if;
    insert into app.contracts(
      tenant_id, contract_no, project_id, proposal_id, engineer_id,
      contract_type, status, title, start_date, end_date, auto_renew,
      currency, monthly_amount, hourly_amount, settlement_lower_hours,
      settlement_upper_hours, payment_terms, notes, created_by, updated_by
    ) values (
      tenant, v_contract_no, v_project_id, v_proposal_id, v_engineer_id,
      v_contract_type, 'draft', v_title, v_start_date, v_end_date, v_auto_renew,
      v_currency, v_monthly_amount, v_hourly_amount, v_settlement_lower,
      v_settlement_upper, v_payment_terms, v_notes, auth.uid(), auth.uid()
    ) returning * into saved;
  else
    select c.* into target
    from app.contracts c
    where c.id = p_contract_id
      and c.tenant_id = tenant
      and c.deleted_at is null
      and app.can_access_contract(c.id, 'contract.manage', 'edit')
    for update;

    if not found or target.row_version <> p_row_version or target.status <> 'draft' then return null; end if;

    update app.contracts
    set contract_no = v_contract_no,
        project_id = v_project_id,
        proposal_id = v_proposal_id,
        engineer_id = v_engineer_id,
        contract_type = v_contract_type,
        title = v_title,
        start_date = v_start_date,
        end_date = v_end_date,
        auto_renew = v_auto_renew,
        currency = v_currency,
        monthly_amount = v_monthly_amount,
        hourly_amount = v_hourly_amount,
        settlement_lower_hours = v_settlement_lower,
        settlement_upper_hours = v_settlement_upper,
        payment_terms = v_payment_terms,
        notes = v_notes,
        updated_by = auth.uid()
    where id = target.id
    returning * into saved;

    delete from app.contract_parties
    where tenant_id = tenant and contract_id = saved.id;
  end if;

  for party in select value from jsonb_array_elements(p_parties)
  loop
    begin
      v_company_id := (party->>'company_id')::uuid;
      v_contact_id := nullif(party->>'contact_id', '')::uuid;
      v_party_role := btrim(party->>'party_role');
      v_billing_role := nullif(btrim(party->>'billing_role'), '');
      v_is_primary := coalesce((party->>'is_primary')::boolean, false);
    exception when others then
      raise exception 'invalid contract party' using errcode = '22023';
    end;

    if jsonb_typeof(party) <> 'object'
       or v_company_id is null
       or v_party_role not in ('customer','supplier','employer','end_client','prime_contractor','subcontractor','other')
       or (v_billing_role is not null and v_billing_role not in ('bill_to','pay_to','none'))
       or not exists (
         select 1 from app.companies c
         where c.id = v_company_id and c.tenant_id = tenant and c.deleted_at is null
           and app.can_access_company(c.id, 'company.read', 'view')
       )
       or (v_contact_id is not null and not exists (
         select 1 from app.company_contacts cc
         where cc.id = v_contact_id and cc.tenant_id = tenant
           and cc.company_id = v_company_id and cc.deleted_at is null
       ))
       or exists (
         select 1 from app.contract_parties cp
         where cp.tenant_id = tenant and cp.contract_id = saved.id
           and cp.company_id = v_company_id and cp.party_role = v_party_role
           and cp.deleted_at is null
       )
    then
      raise exception 'invalid contract party' using errcode = '22023';
    end if;

    insert into app.contract_parties(
      tenant_id, contract_id, company_id, contact_id, party_role,
      billing_role, is_primary, created_by, updated_by
    ) values (
      tenant, saved.id, v_company_id, v_contact_id, v_party_role,
      v_billing_role, v_is_primary, auth.uid(), auth.uid()
    );
  end loop;

  if (
    select count(*) from app.contract_parties cp
    where cp.tenant_id = tenant and cp.contract_id = saved.id
      and cp.deleted_at is null and cp.is_primary
  ) > 1 then
    raise exception 'only one primary contract party is allowed' using errcode = '22023';
  end if;

  select coalesce(max(v.version_no), 0) + 1 into v_version_no
  from app.contract_versions v
  where v.tenant_id = tenant and v.contract_id = saved.id;

  v_contract_data := jsonb_build_object(
    'contract_no', saved.contract_no, 'project_id', saved.project_id,
    'proposal_id', saved.proposal_id, 'engineer_id', saved.engineer_id,
    'contract_type', saved.contract_type, 'title', saved.title,
    'start_date', saved.start_date, 'end_date', saved.end_date,
    'auto_renew', saved.auto_renew, 'currency', saved.currency,
    'monthly_amount', saved.monthly_amount, 'hourly_amount', saved.hourly_amount,
    'settlement_lower_hours', saved.settlement_lower_hours,
    'settlement_upper_hours', saved.settlement_upper_hours,
    'payment_terms', saved.payment_terms, 'notes', saved.notes
  );

  insert into app.contract_versions(
    tenant_id, contract_id, version_no, effective_from, effective_to,
    contract_data, change_summary, created_by
  ) values (
    tenant, saved.id, v_version_no, saved.start_date, saved.end_date,
    v_contract_data, coalesce(v_change_summary, case when v_version_no = 1 then 'Initial draft' end), auth.uid()
  );

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user',
    case when p_contract_id is null then 'contract.created' else 'contract.updated' end,
    'contract', saved.id, nullif(p_request_id, ''),
    case when p_contract_id is null then null else jsonb_build_object('status', target.status, 'row_version', target.row_version) end,
    jsonb_build_object('contract_no', saved.contract_no, 'status', saved.status, 'row_version', saved.row_version),
    jsonb_build_object('version_no', v_version_no, 'party_count', jsonb_array_length(p_parties))
  );

  return jsonb_build_object('id', saved.id);
end
$$;

create or replace function public.transition_contract_status(
  p_contract_id uuid,
  p_row_version bigint,
  p_to_status text,
  p_reason text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  target app.contracts%rowtype;
  saved app.contracts%rowtype;
  approval app.approval_requests%rowtype;
  reason text := nullif(btrim(p_reason), '');
  permission text;
begin
  if auth.uid() is null or tenant is null or p_contract_id is null
     or p_row_version is null or p_row_version < 1
     or p_to_status not in ('draft','review','active')
     or length(coalesce(reason, '')) > 1000
     or (p_to_status = 'draft' and reason is null)
  then
    raise exception 'invalid contract status request' using errcode = '22023';
  end if;

  select c.* into target
  from app.contracts c
  where c.id = p_contract_id
    and c.tenant_id = tenant
    and c.deleted_at is null
  for update;

  if not found or target.row_version <> p_row_version then return null; end if;

  permission := case
    when target.status = 'draft' and p_to_status = 'review' then 'contract.manage'
    when target.status = 'review' and p_to_status in ('draft','active') then 'contract.approve'
    else null
  end;

  if permission is null
     or not app.can_access_contract(target.id, permission, 'edit')
  then
    return null;
  end if;

  if p_to_status = 'review' then
    if not exists (
      select 1 from app.contract_parties p
      where p.tenant_id = tenant and p.contract_id = target.id and p.deleted_at is null
    ) or not exists (
      select 1 from app.contract_versions v
      where v.tenant_id = tenant and v.contract_id = target.id
    ) then
      return null;
    end if;

    insert into app.approval_requests(
      tenant_id, target_type, target_id, request_type, status,
      requested_by, requested_at, request_note, metadata
    ) values (
      tenant, 'contract', target.id, 'contract_approval', 'pending',
      auth.uid(), statement_timestamp(), reason,
      jsonb_build_object('contract_row_version', target.row_version, 'request_id', nullif(p_request_id, ''))
    ) returning * into approval;
  else
    select ar.* into approval
    from app.approval_requests ar
    where ar.tenant_id = tenant and ar.target_type = 'contract'
      and ar.target_id = target.id and ar.request_type = 'contract_approval'
      and ar.status = 'pending'
    order by ar.created_at desc, ar.id desc
    limit 1
    for update;
    if not found then return null; end if;

    update app.approval_requests
    set status = case when p_to_status = 'active' then 'approved' else 'rejected' end,
        completed_at = statement_timestamp(), decision_note = reason
    where id = approval.id
    returning * into approval;

    if p_to_status = 'active' then
      update app.contract_versions
      set approved_at = statement_timestamp(), approved_by = auth.uid()
      where id = (
        select v.id from app.contract_versions v
        where v.tenant_id = tenant and v.contract_id = target.id
        order by v.version_no desc limit 1
      );
    end if;
  end if;

  update app.contracts
  set status = p_to_status, updated_by = auth.uid()
  where id = target.id
  returning * into saved;

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'contract.status_changed', 'contract', saved.id,
    nullif(p_request_id, ''),
    jsonb_build_object('status', target.status, 'row_version', target.row_version),
    jsonb_build_object('status', saved.status, 'row_version', saved.row_version),
    jsonb_build_object('approval_request_id', approval.id, 'reason', reason)
  );

  return jsonb_build_object('id', saved.id);
end
$$;

-- Include only the latest approval summary; approver IDs and internal metadata remain hidden.
create or replace function public.get_contract_detail(p_contract_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare result jsonb;
begin
  if auth.uid() is null or not app.can_access_contract(p_contract_id, 'contract.read', 'view') then
    raise exception 'contract is not accessible' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', c.id, 'contract_no', c.contract_no, 'project_id', c.project_id,
    'proposal_id', c.proposal_id, 'engineer_id', c.engineer_id,
    'contract_type', c.contract_type, 'status', c.status, 'title', c.title,
    'start_date', c.start_date, 'end_date', c.end_date, 'auto_renew', c.auto_renew,
    'currency', c.currency, 'monthly_amount', c.monthly_amount,
    'hourly_amount', c.hourly_amount, 'settlement_lower_hours', c.settlement_lower_hours,
    'settlement_upper_hours', c.settlement_upper_hours, 'payment_terms', c.payment_terms,
    'notes', c.notes, 'updated_at', c.updated_at, 'row_version', c.row_version,
    'parties', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'company_id', p.company_id, 'contact_id', p.contact_id,
      'party_role', p.party_role, 'billing_role', p.billing_role, 'is_primary', p.is_primary
    ) order by p.is_primary desc, p.party_role, p.id)
      from app.contract_parties p where p.contract_id=c.id and p.tenant_id=c.tenant_id and p.deleted_at is null), '[]'::jsonb),
    'versions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'version_no', v.version_no, 'effective_from', v.effective_from,
      'effective_to', v.effective_to, 'change_summary', v.change_summary,
      'approved_at', v.approved_at, 'created_at', v.created_at
    ) order by v.version_no desc)
      from app.contract_versions v where v.contract_id=c.id and v.tenant_id=c.tenant_id), '[]'::jsonb),
    'work_logs', coalesce((select jsonb_agg(jsonb_build_object(
      'id', w.id, 'engineer_id', w.engineer_id, 'work_month', w.work_month,
      'status', w.status, 'scheduled_days', w.scheduled_days, 'actual_days', w.actual_days,
      'scheduled_hours', w.scheduled_hours, 'actual_hours', w.actual_hours,
      'overtime_hours', w.overtime_hours, 'absence_hours', w.absence_hours,
      'customer_approved_at', w.customer_approved_at, 'updated_at', w.updated_at,
      'row_version', w.row_version
    ) order by w.work_month desc)
      from app.work_logs w where w.contract_id=c.id and w.tenant_id=c.tenant_id and w.deleted_at is null), '[]'::jsonb),
    'approval', (select jsonb_build_object(
      'id', ar.id, 'status', ar.status, 'requested_at', ar.requested_at,
      'completed_at', ar.completed_at, 'request_note', ar.request_note,
      'decision_note', ar.decision_note, 'row_version', ar.row_version
    ) from app.approval_requests ar
      where ar.tenant_id=c.tenant_id and ar.target_type='contract' and ar.target_id=c.id
        and ar.request_type='contract_approval'
      order by ar.created_at desc, ar.id desc limit 1)
  ) into result
  from app.contracts c
  where c.id=p_contract_id and c.tenant_id=app.current_tenant_id() and c.deleted_at is null;
  return result;
end
$$;

revoke all on function public.save_contract(uuid, bigint, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.transition_contract_status(uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.save_contract(uuid, bigint, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.transition_contract_status(uuid, bigint, text, text, text) to authenticated;

comment on function public.save_contract(uuid, bigint, jsonb, jsonb, text, text) is
  'Creates or updates one authorized draft contract with parties, immutable term version, optimistic locking, and audit.';
comment on function public.transition_contract_status(uuid, bigint, text, text, text) is
  'Submits, approves, or rejects one authorized contract with approval request and audit state kept atomic.';

commit;
