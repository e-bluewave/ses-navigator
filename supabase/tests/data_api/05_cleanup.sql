-- SES Navigator Data API validation cleanup
-- Target: e-bluewave/ses-navigator, branch ddl-initial, migrations 001-117
--
-- Removes only the deterministic rows created by 02_setup.sql.
-- User A's Authentication account is retained.
-- User B's Authentication account is deleted after all application rows.
--
-- Run once in the Supabase SQL Editor as the database owner.
-- Any failed safety check or deletion rolls back the entire cleanup.

begin;

create temporary table sesn_data_api_cleanup_result (
  result jsonb not null
) on commit preserve rows;

do $cleanup$
declare
  v_validation_marker constant text :=
    'SESN-DATA-API-VALIDATION-V1';

  v_tenant_a_id constant uuid :=
    '7a110000-0000-4000-8000-000000000001';
  v_tenant_b_id constant uuid :=
    '7a110000-0000-4000-8000-000000000002';
  v_organization_a_id constant uuid :=
    '7a120000-0000-4000-8000-000000000001';
  v_organization_b_id constant uuid :=
    '7a120000-0000-4000-8000-000000000002';
  v_role_a_id constant uuid :=
    '7a130000-0000-4000-8000-000000000001';
  v_tenant_membership_a_id constant uuid :=
    '7a140000-0000-4000-8000-000000000001';
  v_tenant_membership_b_id constant uuid :=
    '7a140000-0000-4000-8000-000000000002';
  v_organization_membership_a_id constant uuid :=
    '7a150000-0000-4000-8000-000000000001';
  v_organization_membership_b_id constant uuid :=
    '7a150000-0000-4000-8000-000000000002';
  v_user_role_a_id constant uuid :=
    '7a160000-0000-4000-8000-000000000001';

  v_company_a_id constant uuid :=
    '7a210000-0000-4000-8000-000000000001';
  v_company_b_id constant uuid :=
    '7a210000-0000-4000-8000-000000000002';
  v_engineer_a_id constant uuid :=
    '7a220000-0000-4000-8000-000000000001';
  v_engineer_b_id constant uuid :=
    '7a220000-0000-4000-8000-000000000002';

  v_contract_a_id constant uuid :=
    '7a310000-0000-4000-8000-000000000001';
  v_contract_b_id constant uuid :=
    '7a310000-0000-4000-8000-000000000002';
  v_contract_party_a_id constant uuid :=
    '7a320000-0000-4000-8000-000000000001';
  v_contract_party_b_id constant uuid :=
    '7a320000-0000-4000-8000-000000000002';
  v_contract_version_a_id constant uuid :=
    '7a330000-0000-4000-8000-000000000001';
  v_contract_version_b_id constant uuid :=
    '7a330000-0000-4000-8000-000000000002';
  v_work_log_a_id constant uuid :=
    '7a340000-0000-4000-8000-000000000001';
  v_work_log_b_id constant uuid :=
    '7a340000-0000-4000-8000-000000000002';

  v_billing_account_a_id constant uuid :=
    '7a410000-0000-4000-8000-000000000001';
  v_billing_account_b_id constant uuid :=
    '7a410000-0000-4000-8000-000000000002';
  v_invoice_a_id constant uuid :=
    '7a420000-0000-4000-8000-000000000001';
  v_invoice_b_id constant uuid :=
    '7a420000-0000-4000-8000-000000000002';
  v_invoice_item_a_id constant uuid :=
    '7a430000-0000-4000-8000-000000000001';
  v_invoice_item_b_id constant uuid :=
    '7a430000-0000-4000-8000-000000000002';
  v_payment_a_id constant uuid :=
    '7a440000-0000-4000-8000-000000000001';
  v_payment_b_id constant uuid :=
    '7a440000-0000-4000-8000-000000000002';
  v_expense_a_id constant uuid :=
    '7a450000-0000-4000-8000-000000000001';
  v_expense_b_id constant uuid :=
    '7a450000-0000-4000-8000-000000000002';

  v_ai_execution_a_id constant uuid :=
    '7a510000-0000-4000-8000-000000000001';
  v_ai_execution_b_id constant uuid :=
    '7a510000-0000-4000-8000-000000000002';
  v_ai_input_a_id constant uuid :=
    '7a520000-0000-4000-8000-000000000001';
  v_ai_input_b_id constant uuid :=
    '7a520000-0000-4000-8000-000000000002';
  v_ai_output_a_id constant uuid :=
    '7a530000-0000-4000-8000-000000000001';
  v_ai_output_b_id constant uuid :=
    '7a530000-0000-4000-8000-000000000002';
  v_ai_review_a_id constant uuid :=
    '7a540000-0000-4000-8000-000000000001';
  v_ai_review_b_id constant uuid :=
    '7a540000-0000-4000-8000-000000000002';
  v_audit_log_a_id constant uuid :=
    '7a610000-0000-4000-8000-000000000001';
  v_audit_log_b_id constant uuid :=
    '7a610000-0000-4000-8000-000000000002';

  v_user_a_id uuid;
  v_user_b_id uuid;
  v_count bigint;
  v_deleted bigint;
  v_deleted_total bigint := 0;
begin
  -- Safety gate: the two reserved tenants must be the exact validation rows.
  select count(*)
  into v_count
  from app.tenants t
  where (
      t.id = v_tenant_a_id
      and lower(t.code::text) = 'zz_data_api_test_a'
      and t.settings ->> 'validation_marker' = v_validation_marker
    )
    or (
      t.id = v_tenant_b_id
      and lower(t.code::text) = 'zz_data_api_test_b'
      and t.settings ->> 'validation_marker' = v_validation_marker
    );

  if v_count <> 2 then
    raise exception
      'cleanup aborted: validation tenants or marker do not match';
  end if;

  select tm.user_id
  into strict v_user_a_id
  from app.tenant_memberships tm
  join app.user_profiles up on up.user_id = tm.user_id
  where tm.id = v_tenant_membership_a_id
    and tm.tenant_id = v_tenant_a_id
    and up.display_name = 'Data API Validation User A';

  select tm.user_id
  into strict v_user_b_id
  from app.tenant_memberships tm
  join app.user_profiles up on up.user_id = tm.user_id
  where tm.id = v_tenant_membership_b_id
    and tm.tenant_id = v_tenant_a_id
    and up.display_name = 'Data API Validation User B';

  if v_user_a_id = v_user_b_id then
    raise exception 'cleanup aborted: User A and User B are the same user';
  end if;

  if not exists (
    select 1 from auth.users where id = v_user_b_id
  ) then
    raise exception
      'cleanup aborted: validation User B is missing from Authentication';
  end if;

  -- Delete in reverse dependency order. Every target is a fixed setup UUID.
  delete from app.ai_execution_reviews
  where id in (v_ai_review_a_id, v_ai_review_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.ai_execution_outputs
  where id in (v_ai_output_a_id, v_ai_output_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.ai_execution_inputs
  where id in (v_ai_input_a_id, v_ai_input_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.ai_executions
  where id in (v_ai_execution_a_id, v_ai_execution_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.expense_records
  where id in (v_expense_a_id, v_expense_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.payments
  where id in (v_payment_a_id, v_payment_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.invoice_items
  where id in (v_invoice_item_a_id, v_invoice_item_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.invoices
  where id in (v_invoice_a_id, v_invoice_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.billing_accounts
  where id in (v_billing_account_a_id, v_billing_account_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.work_logs
  where id in (v_work_log_a_id, v_work_log_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.contract_versions
  where id in (v_contract_version_a_id, v_contract_version_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.contract_parties
  where id in (v_contract_party_a_id, v_contract_party_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.contracts
  where id in (v_contract_a_id, v_contract_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.engineer_private_details
  where engineer_id in (v_engineer_a_id, v_engineer_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.engineers
  where id in (v_engineer_a_id, v_engineer_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.companies
  where id in (v_company_a_id, v_company_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.user_roles
  where id = v_user_role_a_id;
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.role_permissions
  where tenant_id = v_tenant_a_id
    and role_id = v_role_a_id;
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.roles
  where id = v_role_a_id;
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.organization_memberships
  where id in (
    v_organization_membership_a_id,
    v_organization_membership_b_id
  );
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.tenant_memberships
  where id in (v_tenant_membership_a_id, v_tenant_membership_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from audit.audit_logs
  where id in (v_audit_log_a_id, v_audit_log_b_id)
     or tenant_id in (v_tenant_a_id, v_tenant_b_id)
     or request_id = v_validation_marker;
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.organizations
  where id in (v_organization_a_id, v_organization_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.user_profiles
  where user_id in (v_user_a_id, v_user_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  delete from app.tenants
  where id in (v_tenant_a_id, v_tenant_b_id);
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  -- User A is retained. User B was created solely for this validation.
  delete from auth.users
  where id = v_user_b_id;
  get diagnostics v_deleted = row_count;

  if v_deleted <> 1 then
    raise exception
      'cleanup aborted: expected to delete exactly one Auth User B';
  end if;

  -- Final zero-residue gate for all deterministic validation identifiers.
  if exists (
    select 1 from app.tenants
    where id in (v_tenant_a_id, v_tenant_b_id)
       or lower(code::text) in (
         'zz_data_api_test_a',
         'zz_data_api_test_b'
       )
    union all
    select 1 from app.organizations
    where id in (v_organization_a_id, v_organization_b_id)
    union all
    select 1 from app.roles
    where id = v_role_a_id
    union all
    select 1 from app.tenant_memberships
    where id in (v_tenant_membership_a_id, v_tenant_membership_b_id)
    union all
    select 1 from app.organization_memberships
    where id in (
      v_organization_membership_a_id,
      v_organization_membership_b_id
    )
    union all
    select 1 from app.user_roles
    where id = v_user_role_a_id
    union all
    select 1 from app.companies
    where id in (v_company_a_id, v_company_b_id)
    union all
    select 1 from app.engineers
    where id in (v_engineer_a_id, v_engineer_b_id)
    union all
    select 1 from app.contracts
    where id in (v_contract_a_id, v_contract_b_id)
    union all
    select 1 from app.contract_parties
    where id in (v_contract_party_a_id, v_contract_party_b_id)
    union all
    select 1 from app.contract_versions
    where id in (v_contract_version_a_id, v_contract_version_b_id)
    union all
    select 1 from app.work_logs
    where id in (v_work_log_a_id, v_work_log_b_id)
    union all
    select 1 from app.billing_accounts
    where id in (v_billing_account_a_id, v_billing_account_b_id)
    union all
    select 1 from app.invoices
    where id in (v_invoice_a_id, v_invoice_b_id)
    union all
    select 1 from app.invoice_items
    where id in (v_invoice_item_a_id, v_invoice_item_b_id)
    union all
    select 1 from app.payments
    where id in (v_payment_a_id, v_payment_b_id)
    union all
    select 1 from app.expense_records
    where id in (v_expense_a_id, v_expense_b_id)
    union all
    select 1 from app.ai_executions
    where id in (v_ai_execution_a_id, v_ai_execution_b_id)
       or metadata ->> 'validation_marker' = v_validation_marker
    union all
    select 1 from app.ai_execution_inputs
    where id in (v_ai_input_a_id, v_ai_input_b_id)
    union all
    select 1 from app.ai_execution_outputs
    where id in (v_ai_output_a_id, v_ai_output_b_id)
    union all
    select 1 from app.ai_execution_reviews
    where id in (v_ai_review_a_id, v_ai_review_b_id)
    union all
    select 1 from audit.audit_logs
    where id in (v_audit_log_a_id, v_audit_log_b_id)
       or request_id = v_validation_marker
    union all
    select 1 from auth.users
    where id = v_user_b_id
  ) then
    raise exception
      'cleanup verification failed: validation residue remains';
  end if;

  if not exists (
    select 1 from auth.users where id = v_user_a_id
  ) then
    raise exception
      'cleanup verification failed: User A Authentication was removed';
  end if;

  insert into sesn_data_api_cleanup_result (result)
  values (
    jsonb_build_object(
      'status', 'CLEANUP_PASSED',
      'validation_marker', v_validation_marker,
      'application_rows_deleted', v_deleted_total,
      'auth_user_b_deleted', true,
      'auth_user_a_retained', true,
      'validation_residue_count', 0
    )
  );
end
$cleanup$;

commit;

select jsonb_pretty(result)
from sesn_data_api_cleanup_result;

drop table sesn_data_api_cleanup_result;
