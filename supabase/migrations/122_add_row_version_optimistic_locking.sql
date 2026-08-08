-- SES Navigator
-- Migration: 122_add_row_version_optimistic_locking
-- Purpose: Add row versions to mutable entities and maintain them automatically.

begin;

alter table app.tenants add column row_version bigint not null default 1;
alter table app.organizations add column row_version bigint not null default 1;
alter table app.user_profiles add column row_version bigint not null default 1;
alter table app.roles add column row_version bigint not null default 1;
alter table app.tenant_memberships add column row_version bigint not null default 1;
alter table app.organization_memberships add column row_version bigint not null default 1;
alter table app.company_roles add column row_version bigint not null default 1;
alter table app.company_risk_records add column row_version bigint not null default 1;
alter table app.company_duplicate_candidates add column row_version bigint not null default 1;
alter table app.engineer_private_details add column row_version bigint not null default 1;
alter table app.engineer_affiliations add column row_version bigint not null default 1;
alter table app.engineer_preferences add column row_version bigint not null default 1;
alter table app.skills add column row_version bigint not null default 1;
alter table app.engineer_skills add column row_version bigint not null default 1;
alter table app.project_company_relations add column row_version bigint not null default 1;
alter table app.project_skills add column row_version bigint not null default 1;
alter table app.project_position_skills add column row_version bigint not null default 1;
alter table app.project_work_conditions add column row_version bigint not null default 1;
alter table app.project_contract_conditions add column row_version bigint not null default 1;
alter table app.project_assignments add column row_version bigint not null default 1;
alter table app.project_merge_jobs add column row_version bigint not null default 1;
alter table app.approval_requests add column row_version bigint not null default 1;
alter table app.approval_steps add column row_version bigint not null default 1;
alter table app.outbound_messages add column row_version bigint not null default 1;
alter table app.message_templates add column row_version bigint not null default 1;
alter table app.interviews add column row_version bigint not null default 1;
alter table app.interview_feedback add column row_version bigint not null default 1;
alter table app.interview_outcomes add column row_version bigint not null default 1;
alter table app.idempotency_records add column row_version bigint not null default 1;
alter table app.webhook_deliveries add column row_version bigint not null default 1;

create or replace function app.increment_row_version()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

create or replace function app.attach_row_version_trigger(target regclass)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  trigger_name text := replace(target::text, '.', '_') || '_increment_row_version';
begin
  execute format('drop trigger if exists %I on %s', trigger_name, target);
  execute format(
    'create trigger %I before update on %s for each row execute function app.increment_row_version()',
    trigger_name,
    target
  );
end;
$$;

comment on function app.increment_row_version()
is 'Increments row_version for every updated row and ignores client-supplied values.';

comment on function app.attach_row_version_trigger(regclass)
is 'Installs the standard before-update trigger that maintains row_version.';

select app.attach_row_version_trigger('app.tenants'::regclass);
select app.attach_row_version_trigger('app.organizations'::regclass);
select app.attach_row_version_trigger('app.user_profiles'::regclass);
select app.attach_row_version_trigger('app.roles'::regclass);
select app.attach_row_version_trigger('app.tenant_memberships'::regclass);
select app.attach_row_version_trigger('app.organization_memberships'::regclass);
select app.attach_row_version_trigger('app.companies'::regclass);
select app.attach_row_version_trigger('app.company_roles'::regclass);
select app.attach_row_version_trigger('app.company_risk_records'::regclass);
select app.attach_row_version_trigger('app.company_contacts'::regclass);
select app.attach_row_version_trigger('app.company_duplicate_candidates'::regclass);
select app.attach_row_version_trigger('app.engineers'::regclass);
select app.attach_row_version_trigger('app.engineer_private_details'::regclass);
select app.attach_row_version_trigger('app.engineer_affiliations'::regclass);
select app.attach_row_version_trigger('app.engineer_preferences'::regclass);
select app.attach_row_version_trigger('app.skills'::regclass);
select app.attach_row_version_trigger('app.engineer_skills'::regclass);
select app.attach_row_version_trigger('app.engineer_career_histories'::regclass);
select app.attach_row_version_trigger('app.engineer_resumes'::regclass);
select app.attach_row_version_trigger('app.projects'::regclass);
select app.attach_row_version_trigger('app.project_sources'::regclass);
select app.attach_row_version_trigger('app.project_company_relations'::regclass);
select app.attach_row_version_trigger('app.project_positions'::regclass);
select app.attach_row_version_trigger('app.project_requirements'::regclass);
select app.attach_row_version_trigger('app.project_skills'::regclass);
select app.attach_row_version_trigger('app.project_position_skills'::regclass);
select app.attach_row_version_trigger('app.project_work_conditions'::regclass);
select app.attach_row_version_trigger('app.project_contract_conditions'::regclass);
select app.attach_row_version_trigger('app.project_assignments'::regclass);
select app.attach_row_version_trigger('app.project_merge_jobs'::regclass);
select app.attach_row_version_trigger('app.proposals'::regclass);
select app.attach_row_version_trigger('app.approval_requests'::regclass);
select app.attach_row_version_trigger('app.approval_steps'::regclass);
select app.attach_row_version_trigger('app.outbound_messages'::regclass);
select app.attach_row_version_trigger('app.message_templates'::regclass);
select app.attach_row_version_trigger('app.interviews'::regclass);
select app.attach_row_version_trigger('app.interview_feedback'::regclass);
select app.attach_row_version_trigger('app.interview_outcomes'::regclass);
select app.attach_row_version_trigger('app.contracts'::regclass);
select app.attach_row_version_trigger('app.contract_parties'::regclass);
select app.attach_row_version_trigger('app.work_logs'::regclass);
select app.attach_row_version_trigger('app.work_log_details'::regclass);
select app.attach_row_version_trigger('app.billing_accounts'::regclass);
select app.attach_row_version_trigger('app.invoices'::regclass);
select app.attach_row_version_trigger('app.invoice_items'::regclass);
select app.attach_row_version_trigger('app.payments'::regclass);
select app.attach_row_version_trigger('app.expense_records'::regclass);
select app.attach_row_version_trigger('app.files'::regclass);
select app.attach_row_version_trigger('app.comments'::regclass);
select app.attach_row_version_trigger('app.tags'::regclass);
select app.attach_row_version_trigger('app.tasks'::regclass);
select app.attach_row_version_trigger('app.saved_searches'::regclass);
select app.attach_row_version_trigger('app.jobs'::regclass);
select app.attach_row_version_trigger('app.ai_executions'::regclass);
select app.attach_row_version_trigger('app.ai_execution_reviews'::regclass);
select app.attach_row_version_trigger('app.idempotency_records'::regclass);
select app.attach_row_version_trigger('app.webhook_subscriptions'::regclass);
select app.attach_row_version_trigger('app.webhook_deliveries'::regclass);

commit;
