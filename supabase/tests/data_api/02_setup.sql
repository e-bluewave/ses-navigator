-- SES Navigator Data API validation setup
-- Target: e-bluewave/ses-navigator, branch ddl-initial, migrations 001-117
--
-- Prerequisites:
--   1. 01_precheck.sql returned READY.
--   2. User B was created in Supabase Authentication with the planned email.
--   3. Replace only the two email values below.
--
-- This is validation data, not a production migration. Run it once in the
-- Supabase SQL Editor as the database owner. Any failure rolls back all rows.

begin;

do $setup$
declare
  v_user_a_email_input constant text :=
    lower('replace-user-a@example.invalid');
  v_user_b_email_input constant text :=
    lower('replace-user-b@example.invalid');
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
  v_user_a_email text;
  v_user_b_email text;
  v_count bigint;
begin
  -- Fail before any write if the two parameters were not replaced.
  if v_user_a_email_input like '%@example.invalid'
     or v_user_b_email_input like '%@example.invalid'
  then
    raise exception
      'replace both User A and User B email placeholders before setup';
  end if;

  if v_user_a_email_input = v_user_b_email_input then
    raise exception 'User A and User B must be different Auth users';
  end if;

  select count(*)
  into v_count
  from auth.users u
  where lower(u.email) = v_user_a_email_input;

  if v_count <> 1 then
    raise exception 'User A must exist exactly once in Authentication';
  end if;

  select count(*)
  into v_count
  from auth.users u
  where lower(u.email) = v_user_b_email_input;

  if v_count <> 1 then
    raise exception
      'User B must be created exactly once in Authentication before setup';
  end if;

  select u.id, u.email
  into strict v_user_a_id, v_user_a_email
  from auth.users u
  where lower(u.email) = v_user_a_email_input;

  select u.id, u.email
  into strict v_user_b_id, v_user_b_email
  from auth.users u
  where lower(u.email) = v_user_b_email_input;

  if v_user_a_id = v_user_b_id then
    raise exception 'User A and User B resolved to the same Auth user';
  end if;

  -- Profiles and assignments are insert-only. Never overwrite or reuse them.
  if exists (
    select 1
    from app.user_profiles up
    where up.user_id in (v_user_a_id, v_user_b_id)
  ) then
    raise exception
      'User A or User B already has an application profile; rerun precheck';
  end if;

  if exists (
    select 1
    from app.tenant_memberships tm
    where tm.user_id in (v_user_a_id, v_user_b_id)
  ) or exists (
    select 1
    from app.organization_memberships om
    where om.user_id in (v_user_a_id, v_user_b_id)
  ) or exists (
    select 1
    from app.user_roles ur
    where ur.user_id in (v_user_a_id, v_user_b_id)
  ) then
    raise exception
      'User A or User B already has application assignments; rerun precheck';
  end if;

  if exists (
    select 1
    from app.system_admins sa
    where sa.user_id in (v_user_a_id, v_user_b_id)
      and sa.is_active
      and sa.revoked_at is null
  ) then
    raise exception
      'A system administrator cannot be used for this authorization test';
  end if;

  select count(*)
  into v_count
  from app.permissions p
  where p.code::text = any (array[
    'engineer.private.read',
    'contract.read',
    'finance.read',
    'ai.read',
    'audit.read'
  ]::text[]);

  if v_count <> 5 then
    raise exception 'the five required permission codes are not available';
  end if;

  if exists (
    select 1
    from app.tenants t
    where lower(t.code::text) in (
      'zz_data_api_test_a',
      'zz_data_api_test_b'
    )
  ) then
    raise exception
      'a reserved validation Tenant code is already in use; run cleanup';
  end if;

  if exists (
    select 1
    from app.ai_executions a
    where a.metadata ->> 'validation_marker' = v_validation_marker
  ) or exists (
    select 1
    from audit.audit_logs l
    where l.request_id = v_validation_marker
  ) then
    raise exception
      'validation marker already exists; run cleanup before setup';
  end if;

  -- Fixed IDs make API validation and cleanup deterministic. A collision is a
  -- hard stop; no existing row is updated or reused.
  if exists (
    select 1 from app.tenants
    where id in (v_tenant_a_id, v_tenant_b_id)
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
  ) then
    raise exception
      'a fixed validation UUID is already in use; run cleanup or investigate';
  end if;

  -- Tenant and organization boundary.
  insert into app.tenants (
    id,
    code,
    name,
    status,
    settings
  )
  values
    (
      v_tenant_a_id,
      'zz_data_api_test_a',
      'Data API Validation Tenant A',
      'active',
      jsonb_build_object('validation_marker', v_validation_marker)
    ),
    (
      v_tenant_b_id,
      'zz_data_api_test_b',
      'Data API Validation Tenant B',
      'active',
      jsonb_build_object('validation_marker', v_validation_marker)
    );

  insert into app.organizations (
    id,
    tenant_id,
    code,
    name,
    organization_type,
    is_active
  )
  values
    (
      v_organization_a_id,
      v_tenant_a_id,
      'validation_org_a',
      'Validation Organization A',
      'department',
      true
    ),
    (
      v_organization_b_id,
      v_tenant_b_id,
      'validation_org_b',
      'Validation Organization B',
      'department',
      true
    );

  -- User A and B share Tenant A and Organization A. Only User A receives a
  -- role, isolating permission checks from membership checks.
  insert into app.user_profiles (
    user_id,
    display_name,
    email,
    status
  )
  values
    (
      v_user_a_id,
      'Data API Validation User A',
      v_user_a_email,
      'active'
    ),
    (
      v_user_b_id,
      'Data API Validation User B',
      v_user_b_email,
      'active'
    );

  insert into app.tenant_memberships (
    id,
    tenant_id,
    user_id,
    membership_status,
    is_default,
    joined_at
  )
  values
    (
      v_tenant_membership_a_id,
      v_tenant_a_id,
      v_user_a_id,
      'active',
      true,
      now()
    ),
    (
      v_tenant_membership_b_id,
      v_tenant_a_id,
      v_user_b_id,
      'active',
      true,
      now()
    );

  insert into app.organization_memberships (
    id,
    tenant_id,
    organization_id,
    user_id,
    position_title,
    membership_status,
    is_primary,
    valid_from
  )
  values
    (
      v_organization_membership_a_id,
      v_tenant_a_id,
      v_organization_a_id,
      v_user_a_id,
      'Validation Reader',
      'active',
      true,
      current_date
    ),
    (
      v_organization_membership_b_id,
      v_tenant_a_id,
      v_organization_a_id,
      v_user_b_id,
      'Validation No Access',
      'active',
      true,
      current_date
    );

  insert into app.roles (
    id,
    tenant_id,
    code,
    name,
    description,
    is_system
  )
  values (
    v_role_a_id,
    v_tenant_a_id,
    'data_api_validation_reader',
    'Data API Validation Reader',
    'Tenant-wide role containing only the five sensitive-read permissions.',
    false
  );

  insert into app.role_permissions (
    tenant_id,
    role_id,
    permission_id,
    granted_by
  )
  select
    v_tenant_a_id,
    v_role_a_id,
    p.id,
    v_user_a_id
  from app.permissions p
  where p.code::text = any (array[
    'engineer.private.read',
    'contract.read',
    'finance.read',
    'ai.read',
    'audit.read'
  ]::text[]);

  insert into app.user_roles (
    id,
    tenant_id,
    user_id,
    role_id,
    organization_id,
    valid_from,
    granted_by
  )
  values (
    v_user_role_a_id,
    v_tenant_a_id,
    v_user_a_id,
    v_role_a_id,
    null,
    current_date,
    v_user_a_id
  );

  -- One company and engineer per tenant.
  insert into app.companies (
    id,
    tenant_id,
    management_no,
    legal_name,
    legal_name_normalized,
    display_name,
    status,
    primary_owner_user_id,
    owner_organization_id,
    created_by,
    updated_by
  )
  values
    (
      v_company_a_id,
      v_tenant_a_id,
      'VAL-COMP-A',
      'Validation Company A',
      'validation company a',
      'Validation A',
      'active',
      v_user_a_id,
      v_organization_a_id,
      v_user_a_id,
      v_user_a_id
    ),
    (
      v_company_b_id,
      v_tenant_b_id,
      'VAL-COMP-B',
      'Validation Company B',
      'validation company b',
      'Validation B',
      'active',
      null,
      v_organization_b_id,
      null,
      null
    );

  insert into app.engineers (
    id,
    tenant_id,
    management_no,
    family_name,
    given_name,
    display_name,
    name_normalized,
    status,
    availability_status,
    available_from,
    nearest_station,
    summary,
    primary_owner_user_id,
    owner_organization_id,
    created_by,
    updated_by
  )
  values
    (
      v_engineer_a_id,
      v_tenant_a_id,
      'VAL-ENG-A',
      '検証',
      '技術者A',
      '検証 技術者A',
      '検証技術者a',
      'active',
      'available',
      date '2026-08-01',
      'Validation Station A',
      'Tenant A validation engineer.',
      v_user_a_id,
      v_organization_a_id,
      v_user_a_id,
      v_user_a_id
    ),
    (
      v_engineer_b_id,
      v_tenant_b_id,
      'VAL-ENG-B',
      '検証',
      '技術者B',
      '検証 技術者B',
      '検証技術者b',
      'active',
      'available',
      date '2026-08-01',
      'Validation Station B',
      'Tenant B validation engineer.',
      null,
      v_organization_b_id,
      null,
      null
    );

  insert into app.engineer_private_details (
    engineer_id,
    tenant_id,
    birth_date,
    gender,
    personal_email,
    phone,
    postal_code,
    prefecture,
    city,
    address_line,
    emergency_contact,
    notes,
    created_by,
    updated_by
  )
  values
    (
      v_engineer_a_id,
      v_tenant_a_id,
      date '1990-01-01',
      'undisclosed',
      'private-a@example.invalid',
      '000-0000-0001',
      '000-0001',
      '東京都',
      '検証区',
      '非公開住所A',
      '非公開緊急連絡先A',
      'RPC detail only A',
      v_user_a_id,
      v_user_a_id
    ),
    (
      v_engineer_b_id,
      v_tenant_b_id,
      date '1991-02-02',
      'undisclosed',
      'private-b@example.invalid',
      '000-0000-0002',
      '000-0002',
      '大阪府',
      '検証市',
      '非公開住所B',
      '非公開緊急連絡先B',
      'RPC detail only B',
      null,
      null
    );

  -- Contract detail children are included so the RPC can verify reviewed
  -- party, version, and work-log arrays.
  insert into app.contracts (
    id,
    tenant_id,
    contract_no,
    engineer_id,
    contract_type,
    status,
    title,
    start_date,
    end_date,
    auto_renew,
    currency,
    monthly_amount,
    settlement_lower_hours,
    settlement_upper_hours,
    payment_terms,
    notes,
    created_by,
    updated_by
  )
  values
    (
      v_contract_a_id,
      v_tenant_a_id,
      'VAL-CON-A',
      v_engineer_a_id,
      'ses',
      'active',
      'Data API Validation Contract A',
      date '2026-07-01',
      date '2026-09-30',
      false,
      'JPY',
      800000,
      140,
      180,
      '月末締め翌月末払い',
      'Authorized contract detail A',
      v_user_a_id,
      v_user_a_id
    ),
    (
      v_contract_b_id,
      v_tenant_b_id,
      'VAL-CON-B',
      v_engineer_b_id,
      'ses',
      'active',
      'Data API Validation Contract B',
      date '2026-07-01',
      date '2026-09-30',
      false,
      'JPY',
      900000,
      140,
      180,
      '月末締め翌月末払い',
      'Cross-tenant contract detail B',
      null,
      null
    );

  insert into app.contract_parties (
    id,
    tenant_id,
    contract_id,
    company_id,
    party_role,
    billing_role,
    is_primary,
    notes,
    created_by,
    updated_by
  )
  values
    (
      v_contract_party_a_id,
      v_tenant_a_id,
      v_contract_a_id,
      v_company_a_id,
      'customer',
      'bill_to',
      true,
      'Validation party A',
      v_user_a_id,
      v_user_a_id
    ),
    (
      v_contract_party_b_id,
      v_tenant_b_id,
      v_contract_b_id,
      v_company_b_id,
      'customer',
      'bill_to',
      true,
      'Validation party B',
      null,
      null
    );

  insert into app.contract_versions (
    id,
    tenant_id,
    contract_id,
    version_no,
    effective_from,
    contract_data,
    document_path,
    document_name,
    document_hash,
    change_summary,
    approved_at,
    approved_by,
    created_by
  )
  values
    (
      v_contract_version_a_id,
      v_tenant_a_id,
      v_contract_a_id,
      1,
      date '2026-07-01',
      '{"secret":"contract-secret-a","monthly_amount":800000}'::jsonb,
      'private/contracts/validation-a.pdf',
      'validation-a.pdf',
      'validation-contract-hash-a',
      'Initial validation version A',
      timestamptz '2026-07-01 00:00:00+00',
      v_user_a_id,
      v_user_a_id
    ),
    (
      v_contract_version_b_id,
      v_tenant_b_id,
      v_contract_b_id,
      1,
      date '2026-07-01',
      '{"secret":"contract-secret-b","monthly_amount":900000}'::jsonb,
      'private/contracts/validation-b.pdf',
      'validation-b.pdf',
      'validation-contract-hash-b',
      'Initial validation version B',
      timestamptz '2026-07-01 00:00:00+00',
      null,
      null
    );

  insert into app.work_logs (
    id,
    tenant_id,
    contract_id,
    engineer_id,
    work_month,
    status,
    scheduled_days,
    actual_days,
    scheduled_hours,
    actual_hours,
    overtime_hours,
    absence_hours,
    customer_approved_at,
    approved_by_name,
    notes,
    created_by,
    updated_by
  )
  values
    (
      v_work_log_a_id,
      v_tenant_a_id,
      v_contract_a_id,
      v_engineer_a_id,
      date '2026-07-01',
      'approved',
      20,
      20,
      160,
      160,
      0,
      0,
      timestamptz '2026-07-31 00:00:00+00',
      'Validation Approver A',
      'Private work-log note A',
      v_user_a_id,
      v_user_a_id
    ),
    (
      v_work_log_b_id,
      v_tenant_b_id,
      v_contract_b_id,
      v_engineer_b_id,
      date '2026-07-01',
      'approved',
      20,
      20,
      160,
      160,
      0,
      0,
      timestamptz '2026-07-31 00:00:00+00',
      'Validation Approver B',
      'Private work-log note B',
      null,
      null
    );

  -- Finance detail contains both allowed fields and deliberately excluded
  -- bank/document/reference fields.
  insert into app.billing_accounts (
    id,
    tenant_id,
    company_id,
    account_type,
    account_name,
    closing_day,
    payment_month_offset,
    payment_day,
    invoice_delivery_method,
    invoice_email,
    bank_name,
    bank_branch_name,
    bank_account_type,
    bank_account_number,
    bank_account_holder,
    tax_registration_number,
    is_default,
    notes,
    created_by,
    updated_by
  )
  values
    (
      v_billing_account_a_id,
      v_tenant_a_id,
      v_company_a_id,
      'receivable',
      'Validation Billing A',
      31,
      1,
      31,
      'email',
      'billing-a@example.invalid',
      'Validation Bank A',
      'Validation Branch A',
      'ordinary',
      '0000001',
      'VALIDATION A',
      'T0000000000001',
      true,
      'Private billing note A',
      v_user_a_id,
      v_user_a_id
    ),
    (
      v_billing_account_b_id,
      v_tenant_b_id,
      v_company_b_id,
      'receivable',
      'Validation Billing B',
      31,
      1,
      31,
      'email',
      'billing-b@example.invalid',
      'Validation Bank B',
      'Validation Branch B',
      'ordinary',
      '0000002',
      'VALIDATION B',
      'T0000000000002',
      true,
      'Private billing note B',
      null,
      null
    );

  insert into app.invoices (
    id,
    tenant_id,
    invoice_no,
    invoice_type,
    contract_id,
    billing_account_id,
    billing_company_id,
    billing_period_start,
    billing_period_end,
    issue_date,
    due_date,
    status,
    currency,
    subtotal,
    tax_amount,
    total_amount,
    paid_amount,
    document_path,
    sent_at,
    notes,
    created_by,
    updated_by
  )
  values
    (
      v_invoice_a_id,
      v_tenant_a_id,
      'VAL-INV-A',
      'sales',
      v_contract_a_id,
      v_billing_account_a_id,
      v_company_a_id,
      date '2026-07-01',
      date '2026-07-31',
      date '2026-07-31',
      date '2026-08-31',
      'partially_paid',
      'JPY',
      800000,
      80000,
      880000,
      440000,
      'private/invoices/validation-a.pdf',
      timestamptz '2026-07-31 01:00:00+00',
      'Private invoice note A',
      v_user_a_id,
      v_user_a_id
    ),
    (
      v_invoice_b_id,
      v_tenant_b_id,
      'VAL-INV-B',
      'sales',
      v_contract_b_id,
      v_billing_account_b_id,
      v_company_b_id,
      date '2026-07-01',
      date '2026-07-31',
      date '2026-07-31',
      date '2026-08-31',
      'issued',
      'JPY',
      900000,
      90000,
      990000,
      0,
      'private/invoices/validation-b.pdf',
      null,
      'Private invoice note B',
      null,
      null
    );

  insert into app.invoice_items (
    id,
    tenant_id,
    invoice_id,
    line_no,
    item_type,
    description,
    quantity,
    unit,
    unit_price,
    tax_rate,
    amount,
    tax_amount,
    work_log_id,
    display_order,
    metadata,
    created_by,
    updated_by
  )
  values
    (
      v_invoice_item_a_id,
      v_tenant_a_id,
      v_invoice_a_id,
      1,
      'service',
      'Validation service A',
      1,
      'month',
      800000,
      10,
      800000,
      80000,
      v_work_log_a_id,
      1,
      '{"internal_note":"not returned by RPC"}'::jsonb,
      v_user_a_id,
      v_user_a_id
    ),
    (
      v_invoice_item_b_id,
      v_tenant_b_id,
      v_invoice_b_id,
      1,
      'service',
      'Validation service B',
      1,
      'month',
      900000,
      10,
      900000,
      90000,
      v_work_log_b_id,
      1,
      '{"internal_note":"not returned by RPC"}'::jsonb,
      null,
      null
    );

  insert into app.payments (
    id,
    tenant_id,
    invoice_id,
    payment_type,
    payment_date,
    amount,
    currency,
    payment_method,
    reference_no,
    bank_fee_amount,
    notes,
    created_by,
    updated_by
  )
  values
    (
      v_payment_a_id,
      v_tenant_a_id,
      v_invoice_a_id,
      'receipt',
      date '2026-08-15',
      440000,
      'JPY',
      'bank_transfer',
      'PRIVATE-REFERENCE-A',
      0,
      'Private payment note A',
      v_user_a_id,
      v_user_a_id
    ),
    (
      v_payment_b_id,
      v_tenant_b_id,
      v_invoice_b_id,
      'receipt',
      date '2026-08-15',
      100000,
      'JPY',
      'bank_transfer',
      'PRIVATE-REFERENCE-B',
      0,
      'Private payment note B',
      null,
      null
    );

  insert into app.expense_records (
    id,
    tenant_id,
    contract_id,
    work_log_id,
    engineer_id,
    expense_date,
    expense_type,
    description,
    amount,
    tax_amount,
    currency,
    status,
    billable,
    invoice_id,
    receipt_path,
    approved_at,
    approved_by,
    notes,
    created_by,
    updated_by
  )
  values
    (
      v_expense_a_id,
      v_tenant_a_id,
      v_contract_a_id,
      v_work_log_a_id,
      v_engineer_a_id,
      date '2026-07-15',
      'transportation',
      'Validation transportation A',
      1100,
      100,
      'JPY',
      'approved',
      true,
      v_invoice_a_id,
      'private/receipts/validation-a.pdf',
      timestamptz '2026-07-20 00:00:00+00',
      v_user_a_id,
      'Private expense note A',
      v_user_a_id,
      v_user_a_id
    ),
    (
      v_expense_b_id,
      v_tenant_b_id,
      v_contract_b_id,
      v_work_log_b_id,
      v_engineer_b_id,
      date '2026-07-15',
      'transportation',
      'Validation transportation B',
      2200,
      200,
      'JPY',
      'approved',
      true,
      v_invoice_b_id,
      'private/receipts/validation-b.pdf',
      timestamptz '2026-07-20 00:00:00+00',
      null,
      'Private expense note B',
      null,
      null
    );

  -- AI inputs stay private. Outputs and reviews are returned only by the
  -- authorized detail RPC.
  insert into app.ai_executions (
    id,
    tenant_id,
    execution_type,
    provider,
    model_name,
    prompt_version,
    status,
    requested_by,
    requested_at,
    started_at,
    completed_at,
    input_tokens,
    output_tokens,
    estimated_cost,
    currency,
    metadata
  )
  values
    (
      v_ai_execution_a_id,
      v_tenant_a_id,
      'data_api_validation',
      'openai',
      'validation-model-a',
      'validation-v1',
      'succeeded',
      v_user_a_id,
      timestamptz '2026-07-30 00:00:00+00',
      timestamptz '2026-07-30 00:00:01+00',
      timestamptz '2026-07-30 00:00:02+00',
      100,
      50,
      0.010000,
      'USD',
      jsonb_build_object(
        'validation_marker',
        v_validation_marker,
        'provider_payload',
        'not returned by view or RPC'
      )
    ),
    (
      v_ai_execution_b_id,
      v_tenant_b_id,
      'data_api_validation',
      'openai',
      'validation-model-b',
      'validation-v1',
      'succeeded',
      null,
      timestamptz '2026-07-30 00:00:00+00',
      timestamptz '2026-07-30 00:00:01+00',
      timestamptz '2026-07-30 00:00:02+00',
      200,
      75,
      0.020000,
      'USD',
      jsonb_build_object(
        'validation_marker',
        v_validation_marker,
        'provider_payload',
        'not returned by view or RPC'
      )
    );

  insert into app.ai_execution_inputs (
    id,
    tenant_id,
    ai_execution_id,
    input_type,
    sequence_no,
    content_text,
    content_hash
  )
  values
    (
      v_ai_input_a_id,
      v_tenant_a_id,
      v_ai_execution_a_id,
      'prompt',
      1,
      'PRIVATE AI INPUT A - must never be returned',
      'validation-ai-input-hash-a'
    ),
    (
      v_ai_input_b_id,
      v_tenant_b_id,
      v_ai_execution_b_id,
      'prompt',
      1,
      'PRIVATE AI INPUT B - must never be returned',
      'validation-ai-input-hash-b'
    );

  insert into app.ai_execution_outputs (
    id,
    tenant_id,
    ai_execution_id,
    output_type,
    sequence_no,
    content_text,
    content_json,
    confidence_score,
    schema_version,
    content_hash
  )
  values
    (
      v_ai_output_a_id,
      v_tenant_a_id,
      v_ai_execution_a_id,
      'validation_result',
      1,
      'Authorized AI output A',
      '{"tenant_label":"A","safe":true}'::jsonb,
      0.95000,
      '1.0',
      'validation-ai-output-hash-a'
    ),
    (
      v_ai_output_b_id,
      v_tenant_b_id,
      v_ai_execution_b_id,
      'validation_result',
      1,
      'Cross-tenant AI output B',
      '{"tenant_label":"B","safe":true}'::jsonb,
      0.90000,
      '1.0',
      'validation-ai-output-hash-b'
    );

  insert into app.ai_execution_reviews (
    id,
    tenant_id,
    ai_execution_id,
    reviewer_id,
    review_status,
    reviewed_at,
    review_comment,
    approved_output_ids
  )
  values
    (
      v_ai_review_a_id,
      v_tenant_a_id,
      v_ai_execution_a_id,
      v_user_a_id,
      'approved',
      timestamptz '2026-07-30 00:01:00+00',
      'Authorized validation review A',
      array[v_ai_output_a_id]::uuid[]
    ),
    (
      v_ai_review_b_id,
      v_tenant_b_id,
      v_ai_execution_b_id,
      null,
      'approved',
      timestamptz '2026-07-30 00:01:00+00',
      'Cross-tenant validation review B',
      array[v_ai_output_b_id]::uuid[]
    );

  -- Nested sensitive keys exercise recursive audit redaction.
  insert into audit.audit_logs (
    id,
    tenant_id,
    occurred_at,
    actor_user_id,
    actor_type,
    action,
    resource_type,
    resource_id,
    request_id,
    source_ip,
    user_agent,
    before_data,
    after_data,
    metadata
  )
  values
    (
      v_audit_log_a_id,
      v_tenant_a_id,
      timestamptz '2026-07-30 00:02:00+00',
      v_user_a_id,
      'user',
      'validation.created',
      'invoice',
      v_invoice_a_id,
      v_validation_marker,
      '192.0.2.1'::inet,
      'PRIVATE USER AGENT A',
      '{"status":"draft","email":"private-a@example.invalid"}'::jsonb,
      '{"status":"issued","nested":{"token":"secret-token-a"}}'::jsonb,
      jsonb_build_object(
        'validation_marker',
        v_validation_marker,
        'api_key',
        'secret-api-key-a',
        'safe_label',
        'A'
      )
    ),
    (
      v_audit_log_b_id,
      v_tenant_b_id,
      timestamptz '2026-07-30 00:02:00+00',
      null,
      'service',
      'validation.created',
      'invoice',
      v_invoice_b_id,
      v_validation_marker,
      '192.0.2.2'::inet,
      'PRIVATE USER AGENT B',
      '{"status":"draft","email":"private-b@example.invalid"}'::jsonb,
      '{"status":"issued","nested":{"token":"secret-token-b"}}'::jsonb,
      jsonb_build_object(
        'validation_marker',
        v_validation_marker,
        'api_key',
        'secret-api-key-b',
        'safe_label',
        'B'
      )
    );

  -- Internal postconditions. A failure here also rolls back the full setup.
  if (select count(*) from app.role_permissions
      where tenant_id = v_tenant_a_id and role_id = v_role_a_id) <> 5
  then
    raise exception 'setup postcondition failed: role permissions';
  end if;

  if (select count(*) from app.tenant_memberships
      where tenant_id = v_tenant_a_id
        and user_id in (v_user_a_id, v_user_b_id)
        and membership_status = 'active'
        and is_default) <> 2
  then
    raise exception 'setup postcondition failed: default memberships';
  end if;

  if (select count(*) from app.user_roles
      where tenant_id = v_tenant_a_id
        and user_id = v_user_a_id
        and revoked_at is null) <> 1
     or exists (
       select 1
       from app.user_roles
       where tenant_id = v_tenant_a_id
         and user_id = v_user_b_id
         and revoked_at is null
     )
  then
    raise exception 'setup postcondition failed: controlled role assignment';
  end if;

  if (select count(*) from app.ai_executions
      where metadata ->> 'validation_marker' = v_validation_marker) <> 2
     or (select count(*) from audit.audit_logs
         where request_id = v_validation_marker) <> 2
  then
    raise exception 'setup postcondition failed: validation markers';
  end if;
end
$setup$;

commit;

-- One-cell, non-sensitive handoff for 03_validation.sql.
select jsonb_pretty(
  jsonb_build_object(
    'status',
    'READY_FOR_VALIDATION',
    'validation_marker',
    'SESN-DATA-API-VALIDATION-V1',
    'tenant_a_id',
    '7a110000-0000-4000-8000-000000000001',
    'tenant_b_id',
    '7a110000-0000-4000-8000-000000000002',
    'tenant_a_resource_ids',
    jsonb_build_object(
      'engineer_private',
      '7a220000-0000-4000-8000-000000000001',
      'contract',
      '7a310000-0000-4000-8000-000000000001',
      'invoice',
      '7a420000-0000-4000-8000-000000000001',
      'ai_execution',
      '7a510000-0000-4000-8000-000000000001',
      'audit_event',
      '7a610000-0000-4000-8000-000000000001'
    ),
    'tenant_b_resource_ids',
    jsonb_build_object(
      'engineer_private',
      '7a220000-0000-4000-8000-000000000002',
      'contract',
      '7a310000-0000-4000-8000-000000000002',
      'invoice',
      '7a420000-0000-4000-8000-000000000002',
      'ai_execution',
      '7a510000-0000-4000-8000-000000000002',
      'audit_event',
      '7a610000-0000-4000-8000-000000000002'
    ),
    'expected_view_rows',
    jsonb_build_object(
      'user_a_tenant_a',
      1,
      'user_a_tenant_b',
      0,
      'user_b_all',
      0,
      'anon',
      'HTTP 401'
    )
  )
) as setup_result;
