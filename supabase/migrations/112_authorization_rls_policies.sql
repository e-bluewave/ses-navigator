-- SES Navigator
-- Migration: 112_authorization_rls_policies
-- Purpose: Replace tenant-only RLS with permission, organization, owner, assignment, and share-aware authorization.

begin;

-- Root-resource access helpers. These functions centralize ownership and
-- explicit-share evaluation so child tables can inherit their parent's scope.
create or replace function app.can_access_company(
  required_company_id uuid,
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
    from app.companies c
    where c.id = required_company_id
      and c.deleted_at is null
      and app.can_access_owned_record(
        c.tenant_id,
        'company',
        c.id,
        c.primary_owner_user_id,
        c.owner_organization_id,
        required_permission,
        required_share_level
      )
  );
$$;

create or replace function app.can_access_company_contact(
  required_contact_id uuid,
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
    from app.company_contacts cc
    where cc.id = required_contact_id
      and cc.deleted_at is null
      and (
        app.can_access_owned_record(
          cc.tenant_id,
          'company_contact',
          cc.id,
          cc.primary_owner_user_id,
          cc.owner_organization_id,
          required_permission,
          required_share_level
        )
        or app.can_access_company(
          cc.company_id,
          required_permission,
          required_share_level
        )
      )
  );
$$;

create or replace function app.can_access_engineer(
  required_engineer_id uuid,
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
    from app.engineers e
    where e.id = required_engineer_id
      and e.deleted_at is null
      and app.can_access_owned_record(
        e.tenant_id,
        'engineer',
        e.id,
        e.primary_owner_user_id,
        e.owner_organization_id,
        required_permission,
        required_share_level
      )
  );
$$;

create or replace function app.can_access_project(
  required_project_id uuid,
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
    from app.projects p
    where p.id = required_project_id
      and p.deleted_at is null
      and app.can_access_owned_record(
        p.tenant_id,
        'project',
        p.id,
        p.primary_owner_user_id,
        p.owner_organization_id,
        required_permission,
        required_share_level
      )
  );
$$;

create or replace function app.can_access_proposal(
  required_proposal_id uuid,
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
    from app.proposals p
    where p.id = required_proposal_id
      and p.deleted_at is null
      and app.can_access_owned_record(
        p.tenant_id,
        'proposal',
        p.id,
        p.primary_owner_user_id,
        p.owner_organization_id,
        required_permission,
        required_share_level
      )
  );
$$;

create or replace function app.can_access_contract(
  required_contract_id uuid,
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
    from app.contracts c
    left join app.proposals proposal on proposal.id = c.proposal_id
    left join app.project_positions proposal_position
      on proposal_position.id = proposal.project_position_id
    left join app.projects proposal_project
      on proposal_project.id = proposal_position.project_id
    left join app.projects direct_project on direct_project.id = c.project_id
    where c.id = required_contract_id
      and c.deleted_at is null
      and app.can_access_owned_record(
        c.tenant_id,
        'contract',
        c.id,
        coalesce(
          proposal.primary_owner_user_id,
          direct_project.primary_owner_user_id,
          proposal_project.primary_owner_user_id,
          c.created_by
        ),
        coalesce(
          proposal.owner_organization_id,
          direct_project.owner_organization_id,
          proposal_project.owner_organization_id
        ),
        required_permission,
        required_share_level
      )
  );
$$;

create or replace function app.can_access_invoice(
  required_invoice_id uuid,
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
    from app.invoices i
    left join app.contracts c on c.id = i.contract_id
    left join app.proposals proposal on proposal.id = c.proposal_id
    left join app.project_positions proposal_position
      on proposal_position.id = proposal.project_position_id
    left join app.projects proposal_project
      on proposal_project.id = proposal_position.project_id
    left join app.projects direct_project on direct_project.id = c.project_id
    where i.id = required_invoice_id
      and i.deleted_at is null
      and app.can_access_owned_record(
        i.tenant_id,
        'invoice',
        i.id,
        coalesce(
          proposal.primary_owner_user_id,
          direct_project.primary_owner_user_id,
          proposal_project.primary_owner_user_id,
          i.created_by
        ),
        coalesce(
          proposal.owner_organization_id,
          direct_project.owner_organization_id,
          proposal_project.owner_organization_id
        ),
        required_permission,
        required_share_level
      )
  );
$$;

create or replace function app.can_access_task(
  required_task_id uuid,
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
    from app.tasks t
    where t.id = required_task_id
      and t.deleted_at is null
      and (
        app.is_system_admin()
        or (
          t.tenant_id = app.current_tenant_id()
          and app.has_permission(required_permission)
          and (
            app.has_permission(required_permission, null)
            or t.created_by = auth.uid()
            or app.has_record_share(
              'task',
              t.id,
              required_share_level
            )
            or exists (
              select 1
              from app.task_assignments ta
              where ta.task_id = t.id
                and ta.tenant_id = t.tenant_id
                and (
                  ta.assignee_user_id = auth.uid()
                  or (
                    ta.assignee_organization_id is not null
                    and (
                      app.belongs_to_organization(
                        ta.tenant_id,
                        ta.assignee_organization_id
                      )
                      or app.has_permission(
                        required_permission,
                        ta.assignee_organization_id
                      )
                    )
                  )
                )
            )
          )
        )
      )
  );
$$;

create or replace function app.can_access_interview(
  required_interview_id uuid,
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
    from app.interviews i
    join app.proposals p on p.id = i.proposal_id
    where i.id = required_interview_id
      and app.can_access_owned_record(
        i.tenant_id,
        'interview',
        i.id,
        p.primary_owner_user_id,
        p.owner_organization_id,
        required_permission,
        required_share_level
      )
  );
$$;

create or replace function app.can_access_outbound_message(
  required_message_id uuid,
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
    from app.outbound_messages m
    left join app.proposals proposal on proposal.id = m.proposal_id
    left join app.projects project on project.id = m.project_id
    left join app.engineers engineer on engineer.id = m.engineer_id
    where m.id = required_message_id
      and app.can_access_owned_record(
        m.tenant_id,
        'outbound_message',
        m.id,
        coalesce(
          proposal.primary_owner_user_id,
          project.primary_owner_user_id,
          engineer.primary_owner_user_id,
          m.created_by
        ),
        coalesce(
          proposal.owner_organization_id,
          project.owner_organization_id,
          engineer.owner_organization_id
        ),
        required_permission,
        required_share_level
      )
  );
$$;

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

revoke all on function app.can_access_company(uuid, text, text) from public;
revoke all on function app.can_access_company_contact(uuid, text, text) from public;
revoke all on function app.can_access_engineer(uuid, text, text) from public;
revoke all on function app.can_access_project(uuid, text, text) from public;
revoke all on function app.can_access_proposal(uuid, text, text) from public;
revoke all on function app.can_access_contract(uuid, text, text) from public;
revoke all on function app.can_access_invoice(uuid, text, text) from public;
revoke all on function app.can_access_task(uuid, text, text) from public;
revoke all on function app.can_access_interview(uuid, text, text) from public;
revoke all on function app.can_access_outbound_message(uuid, text, text) from public;
revoke all on function app.can_access_resource(text, uuid, text, text) from public;

grant execute on function app.can_access_company(uuid, text, text) to authenticated;
grant execute on function app.can_access_company_contact(uuid, text, text) to authenticated;
grant execute on function app.can_access_engineer(uuid, text, text) to authenticated;
grant execute on function app.can_access_project(uuid, text, text) to authenticated;
grant execute on function app.can_access_proposal(uuid, text, text) to authenticated;
grant execute on function app.can_access_contract(uuid, text, text) to authenticated;
grant execute on function app.can_access_invoice(uuid, text, text) to authenticated;
grant execute on function app.can_access_task(uuid, text, text) to authenticated;
grant execute on function app.can_access_interview(uuid, text, text) to authenticated;
grant execute on function app.can_access_outbound_message(uuid, text, text) to authenticated;
grant execute on function app.can_access_resource(text, uuid, text, text) to authenticated;

-- Migration-only installer used to consistently replace the broad policies
-- created by migration 110. DELETE remains denied for authenticated clients.
create or replace function private.install_authorization_policies(
  target_table regclass,
  select_expression text,
  insert_expression text,
  update_using_expression text,
  update_check_expression text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  execute format('alter table %s enable row level security', target_table);
  execute format('alter table %s force row level security', target_table);
  execute format('drop policy if exists tenant_select on %s', target_table);
  execute format('drop policy if exists tenant_insert on %s', target_table);
  execute format('drop policy if exists tenant_update on %s', target_table);
  execute format('drop policy if exists authorization_select on %s', target_table);
  execute format('drop policy if exists authorization_insert on %s', target_table);
  execute format('drop policy if exists authorization_update on %s', target_table);
  execute format(
    'create policy authorization_select on %s for select to authenticated using (%s)',
    target_table,
    select_expression
  );
  execute format(
    'create policy authorization_insert on %s for insert to authenticated with check (%s)',
    target_table,
    insert_expression
  );
  execute format(
    'create policy authorization_update on %s for update to authenticated using (%s) with check (%s)',
    target_table,
    update_using_expression,
    coalesce(update_check_expression, update_using_expression)
  );
end;
$$;

-- Global user profile. Tenant and organization affiliation now live only in
-- membership tables, so this table requires explicit non-tenant RLS.
select private.install_authorization_policies(
  'app.user_profiles',
  'app.is_system_admin() or user_id = auth.uid() or app.has_permission(''user.read'') or app.has_permission(''user.manage'')',
  'app.is_system_admin() or user_id = auth.uid() or app.has_permission(''user.manage'', null)',
  'app.is_system_admin() or user_id = auth.uid() or app.has_permission(''user.manage'', null)'
);

-- Organization, role, membership, and sharing administration.
select private.install_authorization_policies(
  'app.organizations',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and (app.belongs_to_organization(tenant_id, id) or app.has_permission(''organization.read'', id) or app.has_permission(''organization.manage'', id)))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and app.has_permission(''organization.manage'', parent_id))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and app.has_permission(''organization.manage'', id))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and app.has_permission(''organization.manage'', coalesce(parent_id, id)))'
);

select private.install_authorization_policies(
  'app.roles',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and (app.has_permission(''role.read'') or app.has_permission(''role.manage'')))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and app.has_permission(''role.manage'', null))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and app.has_permission(''role.manage'', null))'
);

select private.install_authorization_policies(
  'app.user_roles',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and (user_id = auth.uid() or app.has_permission(''role.read'') or app.has_permission(''role.manage'')))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and app.has_permission(''role.manage'', null))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and app.has_permission(''role.manage'', null))'
);

select private.install_authorization_policies(
  'app.role_permissions',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and (app.has_permission(''role.read'') or app.has_permission(''role.manage'')))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and app.has_permission(''role.manage'', null))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and app.has_permission(''role.manage'', null))'
);

select private.install_authorization_policies(
  'app.tenant_memberships',
  'app.is_system_admin() or user_id = auth.uid() or (tenant_id = app.current_tenant_id() and (app.has_permission(''user.read'') or app.has_permission(''user.manage'')))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and app.has_permission(''user.manage'', null))',
  'app.is_system_admin() or user_id = auth.uid() or (tenant_id = app.current_tenant_id() and app.has_permission(''user.manage'', null))'
);

select private.install_authorization_policies(
  'app.organization_memberships',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and (user_id = auth.uid() or app.has_permission(''user.read'', organization_id) or app.has_permission(''user.manage'', organization_id)))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and app.has_permission(''user.manage'', organization_id))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and app.has_permission(''user.manage'', organization_id))'
);

select private.install_authorization_policies(
  'app.record_shares',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and (created_by = auth.uid() or shared_with_user_id = auth.uid() or (shared_with_organization_id is not null and app.belongs_to_organization(tenant_id, shared_with_organization_id)) or app.has_permission(''share.read'') or app.has_permission(''share.manage'')))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and app.has_permission(''share.manage'') and app.can_access_resource(resource_type, resource_id, ''share.manage'', ''edit''))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and app.has_permission(''share.manage'') and created_by = auth.uid())'
);

-- Shared and tenant skill catalogs.
select private.install_authorization_policies(
  'app.skills',
  'app.is_system_admin() or (app.current_tenant_id() is not null and (tenant_id is null or tenant_id = app.current_tenant_id()) and (app.has_permission(''engineer.read'') or app.has_permission(''project.read'') or app.has_permission(''engineer.manage'') or app.has_permission(''project.manage'')))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and (app.has_permission(''engineer.manage'', null) or app.has_permission(''project.manage'', null)))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and (app.has_permission(''engineer.manage'', null) or app.has_permission(''project.manage'', null)))'
);

select private.install_authorization_policies(
  'app.skill_aliases',
  'app.is_system_admin() or (app.current_tenant_id() is not null and (tenant_id is null or tenant_id = app.current_tenant_id()) and (app.has_permission(''engineer.read'') or app.has_permission(''project.read'') or app.has_permission(''engineer.manage'') or app.has_permission(''project.manage'')))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and (app.has_permission(''engineer.manage'', null) or app.has_permission(''project.manage'', null)))',
  'app.is_system_admin() or (tenant_id = app.current_tenant_id() and (app.has_permission(''engineer.manage'', null) or app.has_permission(''project.manage'', null)))'
);

-- Company roots and descendants.
select private.install_authorization_policies(
  'app.companies',
  'deleted_at is null and app.can_access_company(id, ''company.read'', ''view'')',
  'app.can_access_owned_record(tenant_id, ''company'', id, primary_owner_user_id, owner_organization_id, ''company.manage'', ''edit'')',
  'deleted_at is null and app.can_access_company(id, ''company.manage'', ''edit'')'
);

select private.install_authorization_policies(
  'app.company_roles',
  'app.can_access_company(company_id, ''company.read'', ''view'')',
  'app.can_access_company(company_id, ''company.manage'', ''edit'')',
  'app.can_access_company(company_id, ''company.manage'', ''edit'')'
);

select private.install_authorization_policies(
  'app.company_risk_records',
  'app.can_access_company(company_id, ''company.risk.read'', ''view'')',
  'app.can_access_company(company_id, ''company.risk.manage'', ''edit'')',
  'app.can_access_company(company_id, ''company.risk.manage'', ''edit'')'
);

select private.install_authorization_policies(
  'app.company_contacts',
  'deleted_at is null and app.can_access_company_contact(id, ''company.read'', ''view'')',
  'app.can_access_owned_record(tenant_id, ''company_contact'', id, primary_owner_user_id, owner_organization_id, ''company.manage'', ''edit'') or app.can_access_company(company_id, ''company.manage'', ''edit'')',
  'deleted_at is null and app.can_access_company_contact(id, ''company.manage'', ''edit'')'
);

select private.install_authorization_policies(
  'app.company_contact_histories',
  'app.can_access_company_contact(company_contact_id, ''company.read'', ''view'')',
  'app.can_access_company_contact(company_contact_id, ''company.manage'', ''edit'')',
  'app.can_access_company_contact(company_contact_id, ''company.manage'', ''edit'')'
);

select private.install_authorization_policies(
  'app.company_duplicate_candidates',
  'app.can_access_company(source_company_id, ''company.read'', ''view'') and app.can_access_company(candidate_company_id, ''company.read'', ''view'')',
  'app.can_access_company(source_company_id, ''company.manage'', ''edit'') and app.can_access_company(candidate_company_id, ''company.manage'', ''edit'')',
  'app.can_access_company(source_company_id, ''company.manage'', ''edit'') and app.can_access_company(candidate_company_id, ''company.manage'', ''edit'')'
);

-- Engineer root and direct children.
select private.install_authorization_policies(
  'app.engineers',
  'deleted_at is null and app.can_access_engineer(id, ''engineer.read'', ''view'')',
  'app.can_access_owned_record(tenant_id, ''engineer'', id, primary_owner_user_id, owner_organization_id, ''engineer.manage'', ''edit'')',
  'deleted_at is null and app.can_access_engineer(id, ''engineer.manage'', ''edit'')'
);

select private.install_authorization_policies(
  'app.engineer_private_details',
  'app.can_access_engineer(engineer_id, ''engineer.private.read'', ''view'')',
  'app.can_access_engineer(engineer_id, ''engineer.private.manage'', ''edit'')',
  'app.can_access_engineer(engineer_id, ''engineer.private.manage'', ''edit'')'
);

do $$
declare
  target_table regclass;
begin
  foreach target_table in array array[
    'app.engineer_affiliations'::regclass,
    'app.engineer_preferences'::regclass,
    'app.engineer_preferred_locations'::regclass,
    'app.engineer_preferred_contract_types'::regclass,
    'app.engineer_skills'::regclass,
    'app.engineer_career_histories'::regclass,
    'app.engineer_resumes'::regclass,
    'app.engineer_duplicate_candidates'::regclass,
    'app.engineer_merge_jobs'::regclass,
    'app.engineer_merge_histories'::regclass
  ]
  loop
    if target_table = 'app.engineer_duplicate_candidates'::regclass then
      perform private.install_authorization_policies(
        target_table,
        'app.can_access_engineer(engineer_id_a, ''engineer.read'', ''view'') and app.can_access_engineer(engineer_id_b, ''engineer.read'', ''view'')',
        'app.can_access_engineer(engineer_id_a, ''engineer.manage'', ''edit'') and app.can_access_engineer(engineer_id_b, ''engineer.manage'', ''edit'')',
        'app.can_access_engineer(engineer_id_a, ''engineer.manage'', ''edit'') and app.can_access_engineer(engineer_id_b, ''engineer.manage'', ''edit'')'
      );
    elsif target_table = 'app.engineer_merge_jobs'::regclass
       or target_table = 'app.engineer_merge_histories'::regclass then
      perform private.install_authorization_policies(
        target_table,
        'app.can_access_engineer(source_engineer_id, ''engineer.read'', ''view'') and app.can_access_engineer(target_engineer_id, ''engineer.read'', ''view'')',
        'app.can_access_engineer(source_engineer_id, ''engineer.manage'', ''edit'') and app.can_access_engineer(target_engineer_id, ''engineer.manage'', ''edit'')',
        'app.can_access_engineer(source_engineer_id, ''engineer.manage'', ''edit'') and app.can_access_engineer(target_engineer_id, ''engineer.manage'', ''edit'')'
      );
    else
      perform private.install_authorization_policies(
        target_table,
        'app.can_access_engineer(engineer_id, ''engineer.read'', ''view'')',
        'app.can_access_engineer(engineer_id, ''engineer.manage'', ''edit'')',
        'app.can_access_engineer(engineer_id, ''engineer.manage'', ''edit'')'
      );
    end if;
  end loop;
end
$$;

select private.install_authorization_policies(
  'app.career_history_skills',
  'exists (select 1 from app.engineer_career_histories h where h.id = career_history_id and app.can_access_engineer(h.engineer_id, ''engineer.read'', ''view''))',
  'exists (select 1 from app.engineer_career_histories h where h.id = career_history_id and app.can_access_engineer(h.engineer_id, ''engineer.manage'', ''edit''))',
  'exists (select 1 from app.engineer_career_histories h where h.id = career_history_id and app.can_access_engineer(h.engineer_id, ''engineer.manage'', ''edit''))'
);

select private.install_authorization_policies(
  'app.engineer_resume_versions',
  'exists (select 1 from app.engineer_resumes r where r.id = resume_id and app.can_access_engineer(r.engineer_id, ''engineer.read'', ''view''))',
  'exists (select 1 from app.engineer_resumes r where r.id = resume_id and app.can_access_engineer(r.engineer_id, ''engineer.manage'', ''edit''))',
  'exists (select 1 from app.engineer_resumes r where r.id = resume_id and app.can_access_engineer(r.engineer_id, ''engineer.manage'', ''edit''))'
);

select private.install_authorization_policies(
  'app.resume_extraction_results',
  'exists (select 1 from app.engineer_resume_versions rv join app.engineer_resumes r on r.id = rv.resume_id where rv.id = resume_version_id and app.can_access_engineer(r.engineer_id, ''engineer.read'', ''view''))',
  'exists (select 1 from app.engineer_resume_versions rv join app.engineer_resumes r on r.id = rv.resume_id where rv.id = resume_version_id and app.can_access_engineer(r.engineer_id, ''engineer.manage'', ''edit''))',
  'exists (select 1 from app.engineer_resume_versions rv join app.engineer_resumes r on r.id = rv.resume_id where rv.id = resume_version_id and app.can_access_engineer(r.engineer_id, ''engineer.manage'', ''edit''))'
);

-- Project root and descendants.
select private.install_authorization_policies(
  'app.projects',
  'deleted_at is null and app.can_access_project(id, ''project.read'', ''view'')',
  'app.can_access_owned_record(tenant_id, ''project'', id, primary_owner_user_id, owner_organization_id, ''project.manage'', ''edit'')',
  'deleted_at is null and app.can_access_project(id, ''project.manage'', ''edit'')'
);

do $$
declare
  target_table regclass;
begin
  foreach target_table in array array[
    'app.project_sources'::regclass,
    'app.project_company_relations'::regclass,
    'app.project_positions'::regclass,
    'app.project_requirements'::regclass,
    'app.project_skills'::regclass,
    'app.project_work_conditions'::regclass,
    'app.project_contract_conditions'::regclass,
    'app.project_assignments'::regclass
  ]
  loop
    perform private.install_authorization_policies(
      target_table,
      'app.can_access_project(project_id, ''project.read'', ''view'')',
      'app.can_access_project(project_id, ''project.manage'', ''edit'')',
      'app.can_access_project(project_id, ''project.manage'', ''edit'')'
    );
  end loop;
end
$$;

select private.install_authorization_policies(
  'app.project_source_versions',
  'exists (select 1 from app.project_sources s where s.id = project_source_id and app.can_access_project(s.project_id, ''project.read'', ''view''))',
  'exists (select 1 from app.project_sources s where s.id = project_source_id and app.can_access_project(s.project_id, ''project.manage'', ''edit''))',
  'exists (select 1 from app.project_sources s where s.id = project_source_id and app.can_access_project(s.project_id, ''project.manage'', ''edit''))'
);

select private.install_authorization_policies(
  'app.project_requirement_versions',
  'exists (select 1 from app.project_requirements r where r.id = project_requirement_id and app.can_access_project(r.project_id, ''project.read'', ''view''))',
  'exists (select 1 from app.project_requirements r where r.id = project_requirement_id and app.can_access_project(r.project_id, ''project.manage'', ''edit''))',
  'exists (select 1 from app.project_requirements r where r.id = project_requirement_id and app.can_access_project(r.project_id, ''project.manage'', ''edit''))'
);

select private.install_authorization_policies(
  'app.project_position_skills',
  'exists (select 1 from app.project_positions p where p.id = project_position_id and app.can_access_project(p.project_id, ''project.read'', ''view''))',
  'exists (select 1 from app.project_positions p where p.id = project_position_id and app.can_access_project(p.project_id, ''project.manage'', ''edit''))',
  'exists (select 1 from app.project_positions p where p.id = project_position_id and app.can_access_project(p.project_id, ''project.manage'', ''edit''))'
);

select private.install_authorization_policies(
  'app.project_duplicate_candidates',
  'app.can_access_project(source_project_id, ''project.read'', ''view'') and app.can_access_project(candidate_project_id, ''project.read'', ''view'')',
  'app.can_access_project(source_project_id, ''project.manage'', ''edit'') and app.can_access_project(candidate_project_id, ''project.manage'', ''edit'')',
  'app.can_access_project(source_project_id, ''project.manage'', ''edit'') and app.can_access_project(candidate_project_id, ''project.manage'', ''edit'')'
);

do $$
declare
  target_table regclass;
begin
  foreach target_table in array array[
    'app.project_merge_jobs'::regclass,
    'app.project_merge_histories'::regclass
  ]
  loop
    perform private.install_authorization_policies(
      target_table,
      'app.can_access_project(surviving_project_id, ''project.read'', ''view'') and app.can_access_project(merged_project_id, ''project.read'', ''view'')',
      'app.can_access_project(surviving_project_id, ''project.manage'', ''edit'') and app.can_access_project(merged_project_id, ''project.manage'', ''edit'')',
      'app.can_access_project(surviving_project_id, ''project.manage'', ''edit'') and app.can_access_project(merged_project_id, ''project.manage'', ''edit'')'
    );
  end loop;
end
$$;

select private.install_authorization_policies(
  'app.project_extraction_results',
  '(project_id is not null and app.can_access_project(project_id, ''project.read'', ''view'')) or exists (select 1 from app.project_sources s where s.id = project_source_id and app.can_access_project(s.project_id, ''project.read'', ''view''))',
  '(project_id is not null and app.can_access_project(project_id, ''project.manage'', ''edit'')) or exists (select 1 from app.project_sources s where s.id = project_source_id and app.can_access_project(s.project_id, ''project.manage'', ''edit''))',
  '(project_id is not null and app.can_access_project(project_id, ''project.manage'', ''edit'')) or exists (select 1 from app.project_sources s where s.id = project_source_id and app.can_access_project(s.project_id, ''project.manage'', ''edit''))'
);

-- Proposal, approval, outbound message, and interview workflows.
select private.install_authorization_policies(
  'app.proposals',
  'deleted_at is null and app.can_access_proposal(id, ''proposal.read'', ''view'')',
  'app.can_access_owned_record(tenant_id, ''proposal'', id, primary_owner_user_id, owner_organization_id, ''proposal.manage'', ''edit'')',
  'deleted_at is null and app.can_access_proposal(id, ''proposal.manage'', ''edit'')'
);

do $$
declare
  target_table regclass;
begin
  foreach target_table in array array[
    'app.proposal_snapshots'::regclass,
    'app.proposal_status_histories'::regclass,
    'app.proposal_outcomes'::regclass
  ]
  loop
    perform private.install_authorization_policies(
      target_table,
      'app.can_access_proposal(proposal_id, ''proposal.read'', ''view'')',
      'app.can_access_proposal(proposal_id, ''proposal.manage'', ''edit'')',
      'app.can_access_proposal(proposal_id, ''proposal.manage'', ''edit'')'
    );
  end loop;
end
$$;

select private.install_authorization_policies(
  'app.approval_requests',
  'tenant_id = app.current_tenant_id() and app.has_permission(''approval.read'') and (requested_by = auth.uid() or app.has_permission(''approval.read'', null) or app.can_access_resource(target_type, target_id, ''approval.read'', ''view''))',
  'tenant_id = app.current_tenant_id() and app.has_permission(''approval.manage'') and requested_by = auth.uid() and app.can_access_resource(target_type, target_id, ''approval.manage'', ''edit'')',
  'tenant_id = app.current_tenant_id() and app.has_permission(''approval.manage'') and (requested_by = auth.uid() or app.has_permission(''approval.manage'', null))'
);

select private.install_authorization_policies(
  'app.approval_steps',
  'tenant_id = app.current_tenant_id() and (approver_user_id = auth.uid() or app.has_permission(''approval.read'') or app.has_permission(''approval.decide''))',
  'tenant_id = app.current_tenant_id() and app.has_permission(''approval.manage'')',
  'tenant_id = app.current_tenant_id() and (approver_user_id = auth.uid() and app.has_permission(''approval.decide'') or app.has_permission(''approval.manage'', null))'
);

select private.install_authorization_policies(
  'app.outbound_messages',
  'app.can_access_outbound_message(id, ''message.read'', ''view'')',
  'tenant_id = app.current_tenant_id() and created_by = auth.uid() and app.has_permission(''message.manage'')',
  'app.can_access_outbound_message(id, ''message.manage'', ''edit'')'
);

do $$
declare
  target_table regclass;
begin
  foreach target_table in array array[
    'app.outbound_message_recipients'::regclass,
    'app.outbound_message_versions'::regclass,
    'app.message_delivery_attempts'::regclass
  ]
  loop
    perform private.install_authorization_policies(
      target_table,
      'app.can_access_outbound_message(outbound_message_id, ''message.read'', ''view'')',
      'app.can_access_outbound_message(outbound_message_id, ''message.manage'', ''edit'')',
      'app.can_access_outbound_message(outbound_message_id, ''message.manage'', ''edit'')'
    );
  end loop;
end
$$;

select private.install_authorization_policies(
  'app.message_templates',
  'tenant_id = app.current_tenant_id() and (app.has_permission(''message.read'') or app.has_permission(''message.manage''))',
  'tenant_id = app.current_tenant_id() and app.has_permission(''message.manage'', null)',
  'tenant_id = app.current_tenant_id() and app.has_permission(''message.manage'', null)'
);

select private.install_authorization_policies(
  'app.interviews',
  'app.can_access_interview(id, ''interview.read'', ''view'')',
  'app.can_access_proposal(proposal_id, ''interview.manage'', ''edit'')',
  'app.can_access_interview(id, ''interview.manage'', ''edit'')'
);

do $$
declare
  target_table regclass;
begin
  foreach target_table in array array[
    'app.interview_participants'::regclass,
    'app.interview_feedback'::regclass,
    'app.interview_status_histories'::regclass,
    'app.interview_outcomes'::regclass
  ]
  loop
    perform private.install_authorization_policies(
      target_table,
      'app.can_access_interview(interview_id, ''interview.read'', ''view'')',
      'app.can_access_interview(interview_id, ''interview.manage'', ''edit'')',
      'app.can_access_interview(interview_id, ''interview.manage'', ''edit'')'
    );
  end loop;
end
$$;

-- Contract, work log, and finance records.
select private.install_authorization_policies(
  'app.contracts',
  'deleted_at is null and app.can_access_contract(id, ''contract.read'', ''view'')',
  'tenant_id = app.current_tenant_id() and created_by = auth.uid() and app.has_permission(''contract.manage'')',
  'deleted_at is null and app.can_access_contract(id, ''contract.manage'', ''edit'')'
);

do $$
declare
  target_table regclass;
begin
  foreach target_table in array array[
    'app.contract_parties'::regclass,
    'app.contract_versions'::regclass,
    'app.work_logs'::regclass
  ]
  loop
    perform private.install_authorization_policies(
      target_table,
      'app.can_access_contract(contract_id, ''contract.read'', ''view'')',
      'app.can_access_contract(contract_id, ''contract.manage'', ''edit'')',
      'app.can_access_contract(contract_id, ''contract.manage'', ''edit'')'
    );
  end loop;
end
$$;

select private.install_authorization_policies(
  'app.work_log_details',
  'exists (select 1 from app.work_logs w where w.id = work_log_id and app.can_access_contract(w.contract_id, ''contract.read'', ''view''))',
  'exists (select 1 from app.work_logs w where w.id = work_log_id and app.can_access_contract(w.contract_id, ''contract.manage'', ''edit''))',
  'exists (select 1 from app.work_logs w where w.id = work_log_id and app.can_access_contract(w.contract_id, ''contract.manage'', ''edit''))'
);

select private.install_authorization_policies(
  'app.billing_accounts',
  'app.can_access_company(company_id, ''finance.read'', ''view'')',
  'app.can_access_company(company_id, ''finance.manage'', ''edit'')',
  'app.can_access_company(company_id, ''finance.manage'', ''edit'')'
);

select private.install_authorization_policies(
  'app.invoices',
  'deleted_at is null and app.can_access_invoice(id, ''finance.read'', ''view'')',
  'tenant_id = app.current_tenant_id() and created_by = auth.uid() and app.has_permission(''finance.manage'')',
  'deleted_at is null and app.can_access_invoice(id, ''finance.manage'', ''edit'')'
);

do $$
declare
  target_table regclass;
begin
  foreach target_table in array array[
    'app.invoice_items'::regclass,
    'app.payments'::regclass
  ]
  loop
    perform private.install_authorization_policies(
      target_table,
      'app.can_access_invoice(invoice_id, ''finance.read'', ''view'')',
      'app.can_access_invoice(invoice_id, ''finance.manage'', ''edit'')',
      'app.can_access_invoice(invoice_id, ''finance.manage'', ''edit'')'
    );
  end loop;
end
$$;

select private.install_authorization_policies(
  'app.expense_records',
  'tenant_id = app.current_tenant_id() and app.has_permission(''finance.read'') and ((invoice_id is not null and app.can_access_invoice(invoice_id, ''finance.read'', ''view'')) or (contract_id is not null and app.can_access_contract(contract_id, ''finance.read'', ''view'')) or created_by = auth.uid())',
  'tenant_id = app.current_tenant_id() and app.has_permission(''finance.manage'') and ((invoice_id is not null and app.can_access_invoice(invoice_id, ''finance.manage'', ''edit'')) or (contract_id is not null and app.can_access_contract(contract_id, ''finance.manage'', ''edit'')) or created_by = auth.uid())',
  'tenant_id = app.current_tenant_id() and app.has_permission(''finance.manage'') and ((invoice_id is not null and app.can_access_invoice(invoice_id, ''finance.manage'', ''edit'')) or (contract_id is not null and app.can_access_contract(contract_id, ''finance.manage'', ''edit'')) or created_by = auth.uid())'
);

-- Files, comments, tags, notifications, tasks, and saved searches.
select private.install_authorization_policies(
  'app.files',
  'deleted_at is null and tenant_id = app.current_tenant_id() and app.has_permission(''file.read'') and (created_by = auth.uid() or app.has_permission(''file.read'', null) or exists (select 1 from app.file_links l where l.file_id = id and app.can_access_resource(l.resource_type, l.resource_id, ''file.read'', ''view'')))',
  'tenant_id = app.current_tenant_id() and created_by = auth.uid() and app.has_permission(''file.manage'')',
  'deleted_at is null and tenant_id = app.current_tenant_id() and app.has_permission(''file.manage'') and (created_by = auth.uid() or app.has_permission(''file.manage'', null) or exists (select 1 from app.file_links l where l.file_id = id and app.can_access_resource(l.resource_type, l.resource_id, ''file.manage'', ''edit'')))'
);

select private.install_authorization_policies(
  'app.file_versions',
  'exists (select 1 from app.files f where f.id = file_id and f.deleted_at is null and (f.created_by = auth.uid() or app.has_permission(''file.read'', null) or exists (select 1 from app.file_links l where l.file_id = f.id and app.can_access_resource(l.resource_type, l.resource_id, ''file.read'', ''view''))))',
  'tenant_id = app.current_tenant_id() and app.has_permission(''file.manage'') and exists (select 1 from app.files f where f.id = file_id and (f.created_by = auth.uid() or app.has_permission(''file.manage'', null)))',
  'tenant_id = app.current_tenant_id() and app.has_permission(''file.manage'') and exists (select 1 from app.files f where f.id = file_id and (f.created_by = auth.uid() or app.has_permission(''file.manage'', null)))'
);

select private.install_authorization_policies(
  'app.file_links',
  'app.can_access_resource(resource_type, resource_id, ''file.read'', ''view'')',
  'app.can_access_resource(resource_type, resource_id, ''file.manage'', ''edit'')',
  'app.can_access_resource(resource_type, resource_id, ''file.manage'', ''edit'')'
);

select private.install_authorization_policies(
  'app.comments',
  'deleted_at is null and tenant_id = app.current_tenant_id() and app.has_permission(''comment.read'') and ((visibility = ''private'' and created_by = auth.uid()) or (visibility = ''organization'' and app.belongs_to_organization(tenant_id, organization_id)) or (visibility = ''tenant'' and app.has_permission(''comment.read'', null)) or exists (select 1 from app.comment_links l where l.comment_id = id and app.can_access_resource(l.resource_type, l.resource_id, ''comment.read'', ''view'')))',
  'tenant_id = app.current_tenant_id() and created_by = auth.uid() and app.has_permission(''comment.manage'') and (visibility <> ''organization'' or app.belongs_to_organization(tenant_id, organization_id))',
  'deleted_at is null and tenant_id = app.current_tenant_id() and created_by = auth.uid() and app.has_permission(''comment.manage'')'
);

select private.install_authorization_policies(
  'app.comment_links',
  'exists (select 1 from app.comments c where c.id = comment_id and c.deleted_at is null) and app.can_access_resource(resource_type, resource_id, ''comment.read'', ''view'')',
  'app.can_access_resource(resource_type, resource_id, ''comment.manage'', ''edit'')',
  'app.can_access_resource(resource_type, resource_id, ''comment.manage'', ''edit'')'
);

select private.install_authorization_policies(
  'app.tags',
  'tenant_id = app.current_tenant_id() and (app.has_permission(''tag.read'') or app.has_permission(''tag.manage''))',
  'tenant_id = app.current_tenant_id() and app.has_permission(''tag.manage'', null)',
  'tenant_id = app.current_tenant_id() and app.has_permission(''tag.manage'', null)'
);

select private.install_authorization_policies(
  'app.tag_links',
  'app.has_permission(''tag.read'') and app.can_access_resource(resource_type, resource_id, ''tag.read'', ''view'')',
  'app.has_permission(''tag.manage'') and app.can_access_resource(resource_type, resource_id, ''tag.manage'', ''edit'')',
  'app.has_permission(''tag.manage'') and app.can_access_resource(resource_type, resource_id, ''tag.manage'', ''edit'')'
);

select private.install_authorization_policies(
  'app.notifications',
  'tenant_id = app.current_tenant_id() and (created_by = auth.uid() or app.has_permission(''notification.manage'', null) or exists (select 1 from app.notification_recipients nr where nr.notification_id = id and nr.user_id = auth.uid()))',
  'tenant_id = app.current_tenant_id() and app.has_permission(''notification.manage'')',
  'tenant_id = app.current_tenant_id() and app.has_permission(''notification.manage'', null)'
);

select private.install_authorization_policies(
  'app.notification_recipients',
  'tenant_id = app.current_tenant_id() and (user_id = auth.uid() or app.has_permission(''notification.manage'', null))',
  'tenant_id = app.current_tenant_id() and app.has_permission(''notification.manage'')',
  'tenant_id = app.current_tenant_id() and (user_id = auth.uid() or app.has_permission(''notification.manage'', null))'
);

select private.install_authorization_policies(
  'app.tasks',
  'app.can_access_task(id, ''task.read'', ''view'')',
  'tenant_id = app.current_tenant_id() and app.has_permission(''task.manage'') and (created_by = auth.uid() or app.has_permission(''task.manage'', null))',
  'app.can_access_task(id, ''task.manage'', ''edit'')'
);

do $$
declare
  target_table regclass;
begin
  foreach target_table in array array[
    'app.task_assignments'::regclass,
    'app.task_links'::regclass
  ]
  loop
    perform private.install_authorization_policies(
      target_table,
      'app.can_access_task(task_id, ''task.read'', ''view'')',
      'app.can_access_task(task_id, ''task.manage'', ''edit'')',
      'app.can_access_task(task_id, ''task.manage'', ''edit'')'
    );
  end loop;
end
$$;

select private.install_authorization_policies(
  'app.saved_searches',
  'deleted_at is null and tenant_id = app.current_tenant_id() and app.has_permission(''search.read'') and (owner_user_id = auth.uid() or is_shared or app.has_permission(''search.manage'', null))',
  'tenant_id = app.current_tenant_id() and owner_user_id = auth.uid() and app.has_permission(''search.manage'')',
  'deleted_at is null and tenant_id = app.current_tenant_id() and owner_user_id = auth.uid() and app.has_permission(''search.manage'')'
);

-- Background jobs, AI executions, outbox, idempotency, and webhooks.
select private.install_authorization_policies(
  'app.jobs',
  'tenant_id = app.current_tenant_id() and app.has_permission(''job.read'') and (created_by = auth.uid() or app.has_permission(''job.read'', null) or app.has_permission(''job.manage'', null))',
  'tenant_id = app.current_tenant_id() and app.has_permission(''job.manage'', null)',
  'tenant_id = app.current_tenant_id() and app.has_permission(''job.manage'', null)'
);

do $$
declare
  target_table regclass;
begin
  foreach target_table in array array[
    'app.job_attempts'::regclass,
    'app.job_results'::regclass
  ]
  loop
    perform private.install_authorization_policies(
      target_table,
      'exists (select 1 from app.jobs j where j.id = job_id and j.tenant_id = app.current_tenant_id() and (j.created_by = auth.uid() or app.has_permission(''job.read'', null) or app.has_permission(''job.manage'', null)))',
      'tenant_id = app.current_tenant_id() and app.has_permission(''job.manage'', null)',
      'tenant_id = app.current_tenant_id() and app.has_permission(''job.manage'', null)'
    );
  end loop;
end
$$;

select private.install_authorization_policies(
  'app.job_events',
  'exists (select 1 from app.jobs j where j.id = job_id and j.tenant_id = app.current_tenant_id() and (j.created_by = auth.uid() or app.has_permission(''job.read'', null) or app.has_permission(''job.manage'', null)))',
  'tenant_id = app.current_tenant_id() and app.has_permission(''job.manage'', null)',
  'false'
);

select private.install_authorization_policies(
  'app.ai_executions',
  'tenant_id = app.current_tenant_id() and app.has_permission(''ai.read'') and (requested_by = auth.uid() or app.has_permission(''ai.read'', null) or app.has_permission(''ai.review'', null))',
  'tenant_id = app.current_tenant_id() and requested_by = auth.uid() and app.has_permission(''ai.execute'')',
  'tenant_id = app.current_tenant_id() and (requested_by = auth.uid() and app.has_permission(''ai.execute'') or app.has_permission(''ai.review'', null))'
);

do $$
declare
  target_table regclass;
begin
  foreach target_table in array array[
    'app.ai_execution_inputs'::regclass,
    'app.ai_execution_outputs'::regclass,
    'app.ai_execution_reviews'::regclass,
    'app.ai_execution_feedback'::regclass
  ]
  loop
    perform private.install_authorization_policies(
      target_table,
      'exists (select 1 from app.ai_executions a where a.id = ai_execution_id and a.tenant_id = app.current_tenant_id() and (a.requested_by = auth.uid() or app.has_permission(''ai.read'', null) or app.has_permission(''ai.review'', null)))',
      'tenant_id = app.current_tenant_id() and (app.has_permission(''ai.execute'') or app.has_permission(''ai.review''))',
      'tenant_id = app.current_tenant_id() and app.has_permission(''ai.review'')'
    );
  end loop;
end
$$;

select private.install_authorization_policies(
  'app.outbox_events',
  'tenant_id = app.current_tenant_id() and app.has_permission(''job.read'', null)',
  'tenant_id = app.current_tenant_id() and app.has_permission(''job.manage'', null)',
  'tenant_id = app.current_tenant_id() and app.has_permission(''job.manage'', null)'
);

select private.install_authorization_policies(
  'app.idempotency_records',
  'tenant_id = app.current_tenant_id() and app.has_permission(''job.read'', null)',
  'tenant_id = app.current_tenant_id() and app.has_permission(''job.manage'', null)',
  'tenant_id = app.current_tenant_id() and app.has_permission(''job.manage'', null)'
);

select private.install_authorization_policies(
  'app.webhook_subscriptions',
  'deleted_at is null and tenant_id = app.current_tenant_id() and (app.has_permission(''webhook.read'', null) or app.has_permission(''webhook.manage'', null))',
  'tenant_id = app.current_tenant_id() and app.has_permission(''webhook.manage'', null)',
  'deleted_at is null and tenant_id = app.current_tenant_id() and app.has_permission(''webhook.manage'', null)'
);

select private.install_authorization_policies(
  'app.webhook_deliveries',
  'tenant_id = app.current_tenant_id() and (app.has_permission(''webhook.read'', null) or app.has_permission(''webhook.manage'', null))',
  'tenant_id = app.current_tenant_id() and app.has_permission(''webhook.manage'', null)',
  'tenant_id = app.current_tenant_id() and app.has_permission(''webhook.manage'', null)'
);

-- Audit policies: task history inherits the task; the audit log requires the
-- explicit audit permission. Both remain append-only for authenticated users.
drop policy if exists task_status_history_select on audit.task_status_histories;
create policy task_status_history_select
  on audit.task_status_histories
  for select
  to authenticated
  using (app.can_access_task(task_id, 'task.read', 'view'));

drop policy if exists audit_log_select on audit.audit_logs;
create policy audit_log_select
  on audit.audit_logs
  for select
  to authenticated
  using (
    app.is_system_admin()
    or (
      tenant_id = app.current_tenant_id()
      and app.has_permission('audit.read', null)
    )
  );

revoke insert, update, delete, truncate
  on audit.task_status_histories
  from public, anon, authenticated;
revoke update, delete, truncate
  on audit.audit_logs
  from public, anon, authenticated;

drop function private.install_authorization_policies(
  regclass,
  text,
  text,
  text,
  text
);

commit;
