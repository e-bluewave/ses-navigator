-- Migration 120: add indexes for composite foreign-key checks
-- Generated from the final schema consistency review.
-- These indexes reduce parent UPDATE/DELETE FK-check scans and support tenant-scoped joins.

begin;

create index if not exists organizations_parent_id_fk_idx
  on app.organizations (tenant_id, parent_id);

create index if not exists user_roles_role_id_fk_idx
  on app.user_roles (tenant_id, role_id);

create index if not exists company_duplicate_candidates_candidate_company_id_fk_idx
  on app.company_duplicate_candidates (tenant_id, candidate_company_id);

create index if not exists engineer_private_details_engineer_id_fk_idx
  on app.engineer_private_details (tenant_id, engineer_id);

create index if not exists career_history_skills_career_history_id_fk_idx
  on app.career_history_skills (tenant_id, career_history_id);

create index if not exists engineer_duplicate_candidates_engineer_id_b_fk_idx
  on app.engineer_duplicate_candidates (tenant_id, engineer_id_b);

create index if not exists engineer_merge_jobs_duplicate_candidate_id_fk_idx
  on app.engineer_merge_jobs (tenant_id, duplicate_candidate_id);

create index if not exists engineer_merge_jobs_source_engineer_id_fk_idx
  on app.engineer_merge_jobs (tenant_id, source_engineer_id);

create index if not exists engineer_merge_jobs_target_engineer_id_fk_idx
  on app.engineer_merge_jobs (tenant_id, target_engineer_id);

create index if not exists engineer_merge_histories_source_engineer_id_fk_idx
  on app.engineer_merge_histories (tenant_id, source_engineer_id);

create index if not exists engineer_merge_histories_target_engineer_id_fk_idx
  on app.engineer_merge_histories (tenant_id, target_engineer_id);

create index if not exists projects_primary_customer_company_id_fk_idx
  on app.projects (tenant_id, primary_customer_company_id);

create index if not exists project_sources_source_company_id_fk_idx
  on app.project_sources (tenant_id, source_company_id);

create index if not exists project_sources_source_contact_id_fk_idx
  on app.project_sources (tenant_id, source_contact_id);

create index if not exists project_company_relations_company_id_fk_idx
  on app.project_company_relations (tenant_id, company_id);

create index if not exists project_requirements_project_position_id_fk_idx
  on app.project_requirements (tenant_id, project_position_id);

create index if not exists project_requirement_versions_source_project_source__f0498a64
  on app.project_requirement_versions (tenant_id, source_project_source_version_id);

create index if not exists project_work_conditions_project_position_id_fk_idx
  on app.project_work_conditions (tenant_id, project_position_id);

create index if not exists project_contract_conditions_project_position_id_fk_idx
  on app.project_contract_conditions (tenant_id, project_position_id);

create index if not exists project_duplicate_candidates_candidate_project_id_fk_idx
  on app.project_duplicate_candidates (tenant_id, candidate_project_id);

create index if not exists project_merge_jobs_surviving_project_id_fk_idx
  on app.project_merge_jobs (tenant_id, surviving_project_id);

create index if not exists project_merge_jobs_merged_project_id_fk_idx
  on app.project_merge_jobs (tenant_id, merged_project_id);

create index if not exists project_merge_histories_merged_project_id_fk_idx
  on app.project_merge_histories (tenant_id, merged_project_id);

create index if not exists project_extraction_results_project_id_fk_idx
  on app.project_extraction_results (tenant_id, project_id);

create index if not exists project_extraction_results_project_source_id_fk_idx
  on app.project_extraction_results (tenant_id, project_source_id);

create index if not exists proposals_project_position_id_fk_idx
  on app.proposals (tenant_id, project_position_id);

create index if not exists proposals_destination_company_id_fk_idx
  on app.proposals (tenant_id, destination_company_id);

create index if not exists proposals_destination_contact_id_fk_idx
  on app.proposals (tenant_id, destination_contact_id);

create index if not exists proposals_resume_version_id_fk_idx
  on app.proposals (tenant_id, resume_version_id);

create index if not exists proposals_requirement_version_id_fk_idx
  on app.proposals (tenant_id, requirement_version_id);

create index if not exists proposal_outcomes_source_company_id_fk_idx
  on app.proposal_outcomes (tenant_id, source_company_id);

create index if not exists proposal_outcomes_source_contact_id_fk_idx
  on app.proposal_outcomes (tenant_id, source_contact_id);

create index if not exists approval_steps_approval_request_id_fk_idx
  on app.approval_steps (tenant_id, approval_request_id);

create index if not exists outbound_messages_proposal_id_fk_idx
  on app.outbound_messages (tenant_id, proposal_id);

create index if not exists outbound_messages_project_id_fk_idx
  on app.outbound_messages (tenant_id, project_id);

create index if not exists outbound_messages_engineer_id_fk_idx
  on app.outbound_messages (tenant_id, engineer_id);

create index if not exists outbound_message_recipients_company_contact_id_fk_idx
  on app.outbound_message_recipients (tenant_id, company_contact_id);

create index if not exists message_delivery_attempts_recipient_id_fk_idx
  on app.message_delivery_attempts (tenant_id, recipient_id);

create index if not exists interviews_proposal_id_fk_idx
  on app.interviews (tenant_id, proposal_id);

create index if not exists interview_participants_engineer_id_fk_idx
  on app.interview_participants (tenant_id, engineer_id);

create index if not exists interview_participants_company_contact_id_fk_idx
  on app.interview_participants (tenant_id, company_contact_id);

create index if not exists interview_feedback_evaluator_contact_id_fk_idx
  on app.interview_feedback (tenant_id, evaluator_contact_id);

create index if not exists contracts_proposal_id_fk_idx
  on app.contracts (tenant_id, proposal_id);

create index if not exists contract_parties_contact_id_fk_idx
  on app.contract_parties (tenant_id, contact_id);

create index if not exists invoices_billing_account_id_fk_idx
  on app.invoices (tenant_id, billing_account_id);

create index if not exists invoice_items_work_log_id_fk_idx
  on app.invoice_items (tenant_id, work_log_id);

create index if not exists expense_records_work_log_id_fk_idx
  on app.expense_records (tenant_id, work_log_id);

create index if not exists expense_records_engineer_id_fk_idx
  on app.expense_records (tenant_id, engineer_id);

create index if not exists expense_records_invoice_id_fk_idx
  on app.expense_records (tenant_id, invoice_id);

create index if not exists comments_parent_comment_id_fk_idx
  on app.comments (tenant_id, parent_comment_id);

create index if not exists ai_executions_job_id_fk_idx
  on app.ai_executions (tenant_id, job_id);

create index if not exists ai_execution_feedback_output_id_fk_idx
  on app.ai_execution_feedback (tenant_id, output_id);

create index if not exists webhook_deliveries_outbox_event_id_fk_idx
  on app.webhook_deliveries (tenant_id, outbox_event_id);

commit;
