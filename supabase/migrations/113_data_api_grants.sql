-- SES Navigator
-- Migration: 113_data_api_grants
-- Purpose: Expose only the reviewed Data API surface to Supabase roles.

begin;

-- Start from a closed posture. Schema USAGE is required before any table or
-- function can be reached, so anon remains unable to access custom schemas.
revoke all on schema app, audit, private, master, integration, reporting
  from public, anon, authenticated, service_role;

revoke all on all tables in schema app, audit, private, master, integration, reporting
  from public, anon, authenticated, service_role;
revoke all on all sequences in schema app, audit, private, master, integration, reporting
  from public, anon, authenticated, service_role;
revoke execute on all functions in schema app, audit, private, master, integration, reporting
  from public, anon, authenticated, service_role;

-- Authenticated clients may reach only the app schema. RLS remains mandatory
-- on every granted table and is the second authorization boundary.
grant usage on schema app to authenticated;

-- Authentication, tenant, organization, and permission metadata.
grant select on table
  app.tenants,
  app.organizations,
  app.user_profiles,
  app.roles,
  app.user_roles,
  app.permissions,
  app.role_permissions,
  app.tenant_memberships,
  app.organization_memberships,
  app.system_admins,
  app.record_shares
to authenticated;

-- Companies.
grant select on table
  app.companies,
  app.company_roles,
  app.company_risk_records,
  app.company_contacts,
  app.company_contact_histories,
  app.company_duplicate_candidates
to authenticated;

-- Engineer data safe for direct row-filtered reads. Private details, resume
-- versions/extraction payloads, and merge data remain closed until migration 114.
grant select on table
  app.engineers,
  app.engineer_affiliations,
  app.engineer_preferences,
  app.engineer_preferred_locations,
  app.engineer_preferred_contract_types,
  app.skills,
  app.skill_aliases,
  app.engineer_skills,
  app.engineer_career_histories,
  app.career_history_skills,
  app.engineer_resumes,
  app.engineer_duplicate_candidates
to authenticated;

-- Project data safe for direct row-filtered reads. Source versions, merge data,
-- and extraction payloads remain closed until migration 114.
grant select on table
  app.projects,
  app.project_sources,
  app.project_company_relations,
  app.project_positions,
  app.project_requirements,
  app.project_requirement_versions,
  app.project_skills,
  app.project_position_skills,
  app.project_work_conditions,
  app.project_contract_conditions,
  app.project_assignments,
  app.project_duplicate_candidates
to authenticated;

-- Proposal, approval, outbound-message, and interview reads. State changes,
-- approvals, and sends will be exposed only through reviewed RPCs.
grant select on table
  app.proposals,
  app.proposal_snapshots,
  app.proposal_status_histories,
  app.proposal_outcomes,
  app.approval_requests,
  app.approval_steps,
  app.outbound_messages,
  app.outbound_message_recipients,
  app.outbound_message_versions,
  app.message_delivery_attempts,
  app.message_templates,
  app.interviews,
  app.interview_participants,
  app.interview_feedback,
  app.interview_status_histories,
  app.interview_outcomes
to authenticated;

-- Files are readable through RLS; upload and version changes require RPCs.
grant select on table
  app.files,
  app.file_versions,
  app.file_links
to authenticated;

-- Low-risk collaborative records may use direct RLS-protected writes.
grant select, insert, update on table
  app.comments,
  app.comment_links,
  app.tags,
  app.tag_links
to authenticated;

-- Notifications are service-created. Recipients may update only rows allowed by
-- the notification-recipient RLS policy (for example, read state).
grant select on table app.notifications to authenticated;
grant select, update on table app.notification_recipients to authenticated;

-- Tasks are read-only through the Data API until workflow RPCs are introduced.
grant select on table
  app.tasks,
  app.task_assignments,
  app.task_links
to authenticated;

-- Saved searches are owned/shared records with direct RLS-protected writes.
grant select, insert, update on table app.saved_searches to authenticated;

-- RLS evaluation helpers. No trigger, normalization, installer, or other
-- implementation function is directly executable by authenticated clients.
grant execute on function app.current_tenant_id() to authenticated;
grant execute on function app.is_system_admin() to authenticated;
grant execute on function app.is_tenant_member(uuid) to authenticated;
grant execute on function app.organization_scope_contains(uuid, uuid, uuid) to authenticated;
grant execute on function app.belongs_to_organization(uuid, uuid) to authenticated;
grant execute on function app.belongs_to_organization(uuid) to authenticated;
grant execute on function app.has_permission(text) to authenticated;
grant execute on function app.has_permission(text, uuid) to authenticated;
grant execute on function app.has_record_share(text, uuid, text) to authenticated;
grant execute on function app.can_access_owned_record(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text
) to authenticated;
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

-- service_role is reserved for trusted server-side jobs, integrations,
-- migrations, and administrative processing.
grant usage on schema app, audit, private, master, integration, reporting
  to service_role;
grant all privileges on all tables in schema app, audit, private, master, integration, reporting
  to service_role;
grant all privileges on all sequences in schema app, audit, private, master, integration, reporting
  to service_role;
grant execute on all functions in schema app, audit, private, master, integration, reporting
  to service_role;

-- Future objects stay closed to PUBLIC, anon, and authenticated. Only
-- service_role receives defaults, and each authenticated exposure requires a
-- reviewed migration.
-- PostgreSQL combines per-schema defaults with global defaults. Revoke client
-- defaults globally first so the built-in PUBLIC EXECUTE default for functions
-- cannot leak back into any custom schema.
alter default privileges
  revoke all on tables from public, anon, authenticated;
alter default privileges
  revoke all on sequences from public, anon, authenticated;
alter default privileges
  revoke execute on functions from public, anon, authenticated;

alter default privileges in schema app, audit, private, master, integration, reporting
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema app, audit, private, master, integration, reporting
  grant all privileges on tables to service_role;

alter default privileges in schema app, audit, private, master, integration, reporting
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema app, audit, private, master, integration, reporting
  grant all privileges on sequences to service_role;

alter default privileges in schema app, audit, private, master, integration, reporting
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app, audit, private, master, integration, reporting
  grant execute on functions to service_role;

commit;
