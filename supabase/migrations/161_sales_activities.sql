-- SES Navigator
-- Migration: 161_sales_activities
-- Purpose: Add company-centered sales activity history and authorization surface.

begin;

create table app.sales_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  company_id uuid not null,
  company_contact_id uuid,
  project_id uuid,
  engineer_id uuid,
  activity_type text not null
    check (activity_type in ('call','email','meeting','visit','proposal','follow_up','other')),
  direction text
    check (direction is null or direction in ('inbound','outbound','internal')),
  occurred_at timestamptz not null,
  subject text not null,
  summary text not null,
  result text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id),
  foreign key (tenant_id, company_id)
    references app.companies(tenant_id, id) on delete restrict,
  foreign key (tenant_id, company_contact_id)
    references app.company_contacts(tenant_id, id)
    on delete set null (company_contact_id),
  foreign key (tenant_id, project_id)
    references app.projects(tenant_id, id)
    on delete set null (project_id),
  foreign key (tenant_id, engineer_id)
    references app.engineers(tenant_id, id)
    on delete set null (engineer_id),
  check (length(btrim(subject)) between 1 and 300),
  check (length(btrim(summary)) between 1 and 10000),
  check (result is null or length(result) <= 10000),
  check (delete_reason is null or length(delete_reason) <= 500),
  check (deleted_at is not null or deleted_by is null)
);

create index sales_activities_company_occurred_idx
  on app.sales_activities(tenant_id, company_id, occurred_at desc, id desc)
  where deleted_at is null;
create index sales_activities_contact_occurred_idx
  on app.sales_activities(tenant_id, company_contact_id, occurred_at desc)
  where deleted_at is null and company_contact_id is not null;
create index sales_activities_project_occurred_idx
  on app.sales_activities(tenant_id, project_id, occurred_at desc)
  where deleted_at is null and project_id is not null;
create index sales_activities_engineer_occurred_idx
  on app.sales_activities(tenant_id, engineer_id, occurred_at desc)
  where deleted_at is null and engineer_id is not null;

select app.attach_updated_at_trigger('app.sales_activities'::regclass);
select app.attach_row_version_trigger('app.sales_activities'::regclass);

create or replace function app.can_access_sales_activity(
  required_sales_activity_id uuid,
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
    from app.sales_activities activity
    where activity.id = required_sales_activity_id
      and activity.deleted_at is null
      and app.can_access_company(
        activity.company_id,
        required_permission,
        required_share_level
      )
  );
$$;

revoke all on function app.can_access_sales_activity(uuid, text, text)
  from public, anon, authenticated;
grant execute on function app.can_access_sales_activity(uuid, text, text)
  to authenticated, service_role;

-- Keep the generic linked-resource authorization helper current so files,
-- comments, task links, and future generic surfaces can resolve sales activity
-- access through the parent company boundary.
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
    when 'sales_activity' then app.can_access_sales_activity(
      required_resource_id, required_permission, required_share_level
    )
    else false
  end;
end;
$$;

revoke all on function app.can_access_resource(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function app.can_access_resource(text, uuid, text, text)
  to authenticated, service_role;

alter table app.sales_activities enable row level security;
alter table app.sales_activities force row level security;

create policy authorization_select
  on app.sales_activities
  for select
  to authenticated
  using (
    deleted_at is null
    and app.can_access_sales_activity(id, 'company.read', 'view')
  );

create policy authorization_insert
  on app.sales_activities
  for insert
  to authenticated
  with check (
    tenant_id = app.current_tenant_id()
    and created_by = auth.uid()
    and app.can_access_company(company_id, 'company.manage', 'edit')
  );

create policy authorization_update
  on app.sales_activities
  for update
  to authenticated
  using (
    deleted_at is null
    and app.can_access_sales_activity(id, 'company.manage', 'edit')
  )
  with check (
    deleted_at is null
    and tenant_id = app.current_tenant_id()
    and app.can_access_company(company_id, 'company.manage', 'edit')
  );

-- The authenticated Data API surface remains RPC-only for this table. Migration
-- 113 default privileges already keep future tables closed to authenticated.
revoke all on table app.sales_activities from public, anon, authenticated;

comment on table app.sales_activities is
  'Company-centered sales touchpoints used to drive follow-up tasks and activity timelines.';

commit;
