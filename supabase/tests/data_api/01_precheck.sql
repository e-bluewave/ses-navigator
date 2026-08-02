-- SES Navigator Data API validation precheck
-- Target: e-bluewave/ses-navigator, branch ddl-initial, migrations 001-117
--
-- Replace only the two email values below before running this statement in
-- Supabase SQL Editor. The result never returns either email address.
--
-- This file contains one SELECT statement only. It does not insert, update,
-- delete, execute an RPC, create a secret, or change database/session settings.

with
params as (
  select
    lower('replace-user-a@example.invalid')::text as user_a_email,
    lower('replace-user-b@example.invalid')::text as planned_user_b_email,
    array[
      'zz_data_api_test_a',
      'zz_data_api_test_b'
    ]::text[] as reserved_tenant_codes,
    'SESN-DATA-API-VALIDATION-V1'::text as validation_marker
),
target_user as (
  select u.id
  from auth.users u
  cross join params p
  where lower(u.email) = p.user_a_email
),
planned_user_b as (
  select u.id
  from auth.users u
  cross join params p
  where lower(u.email) = p.planned_user_b_email
),
user_counts as (
  select
    (select count(*) from target_user) as user_a_count,
    (select count(*) from planned_user_b) as user_b_count
),
profile_state as (
  select
    count(*) as profile_count,
    coalesce(
      sum(case when up.status = 'active' then 1 else 0 end),
      0
    ) as active_profile_count
  from app.user_profiles up
  join target_user tu on tu.id = up.user_id
),
system_admin_state as (
  select count(*) as active_system_admin_count
  from app.system_admins sa
  join target_user tu on tu.id = sa.user_id
  where sa.is_active
    and sa.revoked_at is null
),
membership_state as (
  select
    coalesce(
      sum(
        case
          when tm.membership_status = 'active'
            and t.status = 'active'
            and (tm.joined_at is null or tm.joined_at <= now())
            and (tm.left_at is null or tm.left_at > now())
            then 1
          else 0
        end
      ),
      0
    ) as current_active_membership_count,
    coalesce(
      sum(
        case
          when tm.membership_status = 'active'
            and tm.is_default
            and t.status = 'active'
            and (tm.joined_at is null or tm.joined_at <= now())
            and (tm.left_at is null or tm.left_at > now())
            then 1
          else 0
        end
      ),
      0
    ) as current_active_default_count
  from app.tenant_memberships tm
  join target_user tu on tu.id = tm.user_id
  join app.tenants t on t.id = tm.tenant_id
),
default_tenant as (
  select tm.tenant_id
  from app.tenant_memberships tm
  join target_user tu on tu.id = tm.user_id
  join app.tenants t on t.id = tm.tenant_id
  join app.user_profiles up on up.user_id = tm.user_id
  where up.status = 'active'
    and tm.membership_status = 'active'
    and tm.is_default
    and t.status = 'active'
    and (tm.joined_at is null or tm.joined_at <= now())
    and (tm.left_at is null or tm.left_at > now())
),
organization_membership_state as (
  select
    coalesce(
      sum(
        case
          when om.membership_status = 'active'
            and om.valid_from <= current_date
            and (om.valid_to is null or om.valid_to >= current_date)
            then 1
          else 0
        end
      ),
      0
    ) as effective_organization_membership_count,
    coalesce(
      sum(
        case
          when om.membership_status = 'active'
            and om.is_primary
            and om.valid_from <= current_date
            and (om.valid_to is null or om.valid_to >= current_date)
            then 1
          else 0
        end
      ),
      0
    ) as effective_primary_organization_count
  from app.organization_memberships om
  join target_user tu on tu.id = om.user_id
  join default_tenant dt on dt.tenant_id = om.tenant_id
),
role_state as (
  select
    count(*) as effective_role_count,
    coalesce(
      sum(case when ur.organization_id is null then 1 else 0 end),
      0
    ) as effective_tenant_wide_role_count
  from app.user_roles ur
  join target_user tu on tu.id = ur.user_id
  join default_tenant dt on dt.tenant_id = ur.tenant_id
  where ur.valid_from <= current_date
    and (ur.valid_to is null or ur.valid_to >= current_date)
    and ur.revoked_at is null
),
required_permissions as (
  select permission_value.code
  from (
    values
      ('engineer.private.read'::text),
      ('contract.read'::text),
      ('finance.read'::text),
      ('ai.read'::text),
      ('audit.read'::text)
  ) as permission_value(code)
),
permission_catalog_state as (
  select
    count(p.id) as present_count,
    coalesce(
      string_agg(
        case when p.id is null then rp.code end,
        ', ' order by rp.code
      ),
      '(none)'
    ) as missing_codes
  from required_permissions rp
  left join app.permissions p on p.code::text = rp.code
),
effective_permission_state as (
  select count(distinct p.code) as effective_required_permission_count
  from app.user_roles ur
  join target_user tu on tu.id = ur.user_id
  join default_tenant dt on dt.tenant_id = ur.tenant_id
  join app.role_permissions rp
    on rp.tenant_id = ur.tenant_id
   and rp.role_id = ur.role_id
  join app.permissions p on p.id = rp.permission_id
  join required_permissions required on required.code = p.code::text
  where ur.valid_from <= current_date
    and (ur.valid_to is null or ur.valid_to >= current_date)
    and ur.revoked_at is null
),
required_views as (
  select view_value.schema_name, view_value.object_name
  from (
    values
      ('public'::text, 'engineer_private_summaries'::text),
      ('public'::text, 'contract_summaries'::text),
      ('public'::text, 'finance_invoice_summaries'::text),
      ('public'::text, 'finance_expense_summaries'::text),
      ('public'::text, 'ai_execution_summaries'::text),
      ('public'::text, 'audit_event_summaries'::text)
  ) as view_value(schema_name, object_name)
),
view_state as (
  select
    count(c.oid) as present_count,
    coalesce(
      sum(
        case
          when coalesce(c.reloptions, array[]::text[])
            @> array['security_barrier=true', 'security_invoker=true']
            then 1
          else 0
        end
      ),
      0
    ) as hardened_count,
    coalesce(
      sum(
        case
          when not has_table_privilege('anon', c.oid, 'SELECT')
            and has_table_privilege('authenticated', c.oid, 'SELECT')
            and not has_table_privilege('service_role', c.oid, 'SELECT')
            then 1
          else 0
        end
      ),
      0
    ) as correct_view_grant_count
  from required_views rv
  left join pg_catalog.pg_namespace n
    on n.nspname = rv.schema_name
  left join pg_catalog.pg_class c
    on c.relnamespace = n.oid
   and c.relname = rv.object_name
   and c.relkind = 'v'
),
required_base_tables as (
  select table_value.schema_name, table_value.object_name
  from (
    values
      ('app'::text, 'engineer_private_details'::text),
      ('app'::text, 'contracts'::text),
      ('app'::text, 'invoices'::text),
      ('app'::text, 'expense_records'::text),
      ('app'::text, 'ai_executions'::text),
      ('audit'::text, 'audit_logs'::text)
  ) as table_value(schema_name, object_name)
),
base_table_state as (
  select
    count(c.oid) as present_count,
    coalesce(
      sum(
        case
          when c.relrowsecurity and c.relforcerowsecurity then 1
          else 0
        end
      ),
      0
    ) as forced_rls_count
  from required_base_tables rt
  left join pg_catalog.pg_namespace n
    on n.nspname = rt.schema_name
  left join pg_catalog.pg_class c
    on c.relnamespace = n.oid
   and c.relname = rt.object_name
   and c.relkind in ('r', 'p')
),
reviewed_column_grants as (
  select
    grant_value.schema_name,
    grant_value.object_name,
    grant_value.column_names
  from (
    values
      (
        'app'::text,
        'engineer_private_details'::text,
        array[
          'engineer_id',
          'birth_date',
          'gender',
          'prefecture',
          'city',
          'updated_at'
        ]::text[]
      ),
      (
        'app'::text,
        'contracts'::text,
        array[
          'id',
          'contract_no',
          'project_id',
          'proposal_id',
          'engineer_id',
          'contract_type',
          'status',
          'title',
          'start_date',
          'end_date',
          'auto_renew',
          'currency',
          'updated_at',
          'row_version',
          'deleted_at'
        ]::text[]
      ),
      (
        'app'::text,
        'invoices'::text,
        array[
          'id',
          'invoice_no',
          'invoice_type',
          'contract_id',
          'billing_company_id',
          'billing_period_start',
          'billing_period_end',
          'issue_date',
          'due_date',
          'status',
          'currency',
          'subtotal',
          'tax_amount',
          'total_amount',
          'paid_amount',
          'sent_at',
          'updated_at',
          'row_version',
          'deleted_at'
        ]::text[]
      ),
      (
        'app'::text,
        'expense_records'::text,
        array[
          'id',
          'tenant_id',
          'contract_id',
          'work_log_id',
          'engineer_id',
          'expense_date',
          'expense_type',
          'description',
          'amount',
          'tax_amount',
          'currency',
          'status',
          'billable',
          'invoice_id',
          'approved_at',
          'updated_at',
          'row_version',
          'deleted_at',
          'created_by'
        ]::text[]
      ),
      (
        'app'::text,
        'ai_executions'::text,
        array[
          'id',
          'tenant_id',
          'job_id',
          'execution_type',
          'provider',
          'model_name',
          'prompt_version',
          'status',
          'requested_by',
          'requested_at',
          'started_at',
          'completed_at',
          'input_tokens',
          'output_tokens',
          'estimated_cost',
          'currency',
          'error_code',
          'created_at',
          'updated_at',
          'row_version'
        ]::text[]
      ),
      (
        'audit'::text,
        'audit_logs'::text,
        array[
          'id',
          'tenant_id',
          'occurred_at',
          'actor_user_id',
          'actor_type',
          'action',
          'resource_type',
          'resource_id',
          'request_id',
          'created_at'
        ]::text[]
      )
  ) as grant_value(schema_name, object_name, column_names)
),
column_grant_state as (
  select
    (
      select count(*)
      from reviewed_column_grants rg
      join pg_catalog.pg_namespace n on n.nspname = rg.schema_name
      join pg_catalog.pg_class c
        on c.relnamespace = n.oid
       and c.relname = rg.object_name
       and c.relkind in ('r', 'p')
      cross join lateral unnest(rg.column_names) as required_column(column_name)
      where not has_column_privilege(
        'authenticated',
        c.oid,
        required_column.column_name,
        'SELECT'
      )
    ) as missing_authenticated_grant_count,
    (
      select count(*)
      from reviewed_column_grants rg
      join pg_catalog.pg_namespace n on n.nspname = rg.schema_name
      join pg_catalog.pg_class c
        on c.relnamespace = n.oid
       and c.relname = rg.object_name
       and c.relkind in ('r', 'p')
      join pg_catalog.pg_attribute a
        on a.attrelid = c.oid
       and a.attnum > 0
       and not a.attisdropped
      where a.attname <> all (rg.column_names)
        and has_column_privilege(
          'authenticated',
          c.oid,
          a.attname,
          'SELECT'
        )
    ) as unexpected_authenticated_grant_count,
    (
      select count(*)
      from reviewed_column_grants rg
      join pg_catalog.pg_namespace n on n.nspname = rg.schema_name
      join pg_catalog.pg_class c
        on c.relnamespace = n.oid
       and c.relname = rg.object_name
       and c.relkind in ('r', 'p')
      where has_any_column_privilege('anon', c.oid, 'SELECT')
    ) as anon_selectable_base_table_count
),
required_functions as (
  select function_value.function_name, function_value.function_oid
  from (
    values
      (
        'app.current_tenant_id()'::text,
        to_regprocedure('app.current_tenant_id()')::oid
      ),
      (
        'app.has_permission(text)'::text,
        to_regprocedure('app.has_permission(text)')::oid
      ),
      (
        'app.has_permission(text,uuid)'::text,
        to_regprocedure('app.has_permission(text,uuid)')::oid
      ),
      (
        'app.can_access_engineer(uuid,text,text)'::text,
        to_regprocedure('app.can_access_engineer(uuid,text,text)')::oid
      ),
      (
        'app.can_access_contract(uuid,text,text)'::text,
        to_regprocedure('app.can_access_contract(uuid,text,text)')::oid
      ),
      (
        'app.can_access_invoice(uuid,text,text)'::text,
        to_regprocedure('app.can_access_invoice(uuid,text,text)')::oid
      )
  ) as function_value(function_name, function_oid)
),
function_state as (
  select
    count(function_oid) as present_count,
    coalesce(
      string_agg(
        case when function_oid is null then function_name end,
        ', ' order by function_name
      ),
      '(none)'
    ) as missing_functions
  from required_functions
),
reserved_tenant_state as (
  select count(*) as collision_count
  from app.tenants t
  cross join params p
  where lower(t.code::text) = any (p.reserved_tenant_codes)
),
validation_marker_state as (
  select
    (
      select count(*)
      from app.ai_executions a
      cross join params p
      where a.metadata ->> 'validation_marker' = p.validation_marker
    ) as ai_marker_count,
    (
      select count(*)
      from audit.audit_logs l
      cross join params p
      where l.request_id = p.validation_marker
    ) as audit_marker_count
),
source_inventory(source_name, row_count) as (
  select
    'engineer_private_details'::text,
    count(*)::bigint
  from app.engineer_private_details d
  join default_tenant dt on dt.tenant_id = d.tenant_id

  union all

  select
    'contracts',
    count(*)
  from app.contracts c
  join default_tenant dt on dt.tenant_id = c.tenant_id
  where c.deleted_at is null

  union all

  select
    'invoices',
    count(*)
  from app.invoices i
  join default_tenant dt on dt.tenant_id = i.tenant_id
  where i.deleted_at is null

  union all

  select
    'expense_records',
    count(*)
  from app.expense_records e
  join default_tenant dt on dt.tenant_id = e.tenant_id
  where e.deleted_at is null

  union all

  select
    'ai_executions',
    count(*)
  from app.ai_executions a
  join default_tenant dt on dt.tenant_id = a.tenant_id

  union all

  select
    'audit_logs',
    count(*)
  from audit.audit_logs l
  join default_tenant dt on dt.tenant_id = l.tenant_id
),
gate_state as (
  select
    case
      when p.user_a_email like '%@example.invalid'
        or p.planned_user_b_email like '%@example.invalid'
        then 'BLOCK'
      when uc.user_a_count <> 1
        or uc.user_b_count <> 0
        or not (
          ps.profile_count = 0
          or (
            ps.profile_count = 1
            and ps.active_profile_count = 1
          )
        )
        or sas.active_system_admin_count <> 0
        or ms.current_active_default_count > 1
        or pcs.present_count <> 5
        or vs.present_count <> 6
        or vs.hardened_count <> 6
        or vs.correct_view_grant_count <> 6
        or bts.present_count <> 6
        or bts.forced_rls_count <> 6
        or cgs.missing_authenticated_grant_count <> 0
        or cgs.unexpected_authenticated_grant_count <> 0
        or cgs.anon_selectable_base_table_count <> 0
        or fs.present_count <> 6
        or rts.collision_count <> 0
        or vms.ai_marker_count <> 0
        or vms.audit_marker_count <> 0
        then 'BLOCK'
      when ms.current_active_default_count = 1
        then 'REVIEW'
      else 'READY'
    end as result
  from params p
  cross join user_counts uc
  cross join profile_state ps
  cross join system_admin_state sas
  cross join membership_state ms
  cross join permission_catalog_state pcs
  cross join view_state vs
  cross join base_table_state bts
  cross join column_grant_state cgs
  cross join function_state fs
  cross join reserved_tenant_state rts
  cross join validation_marker_state vms
),
checks as (
  select
    10 as sort_order,
    'parameters'::text as section,
    'User A email replaced'::text as check_name,
    case
      when p.user_a_email like '%@example.invalid' then 'BLOCK'
      else 'PASS'
    end::text as result,
    case
      when p.user_a_email like '%@example.invalid' then 'not replaced'
      else 'replaced (value hidden)'
    end::text as observed,
    'User A is resolved by email without returning the email.'::text
      as impact
  from params p

  union all

  select
    20,
    'parameters',
    'planned User B email replaced',
    case
      when p.planned_user_b_email like '%@example.invalid' then 'BLOCK'
      else 'PASS'
    end,
    case
      when p.planned_user_b_email like '%@example.invalid' then 'not replaced'
      else 'replaced (value hidden)'
    end,
    'The future Auth user must have a collision-free email.'
  from params p

  union all

  select
    30,
    'identity',
    'User A exists exactly once',
    case when uc.user_a_count = 1 then 'PASS' else 'BLOCK' end,
    format('matching auth users=%s', uc.user_a_count),
    'Zero or multiple matches make every later membership check unreliable.'
  from user_counts uc

  union all

  select
    40,
    'identity',
    'planned User B does not exist',
    case when uc.user_b_count = 0 then 'PASS' else 'BLOCK' end,
    format('matching auth users=%s', uc.user_b_count),
    'A pre-existing account must not be overwritten or silently reused.'
  from user_counts uc

  union all

  select
    50,
    'identity',
    'User A profile is absent or active',
    case
      when ps.profile_count = 0 then 'PASS'
      when ps.profile_count = 1 and ps.active_profile_count = 1 then 'PASS'
      else 'BLOCK'
    end,
    format(
      'profiles=%s, active_profiles=%s',
      ps.profile_count,
      ps.active_profile_count
    ),
    'Zero profiles is safe before setup; setup must create one active profile. An existing non-active profile is blocked to prevent overwrite.'
  from profile_state ps

  union all

  select
    60,
    'identity',
    'User A is not a system admin',
    case when sas.active_system_admin_count = 0 then 'PASS' else 'BLOCK' end,
    format('active_system_admin_rows=%s', sas.active_system_admin_count),
    'A system admin bypasses tenant and permission checks, invalidating the test.'
  from system_admin_state sas

  union all

  select
    70,
    'membership',
    'current active memberships',
    'INFO',
    format('rows=%s', ms.current_active_membership_count),
    'Existing memberships are not changed by this precheck.'
  from membership_state ms

  union all

  select
    80,
    'membership',
    'current active default membership',
    case
      when ms.current_active_default_count = 0 then 'PASS'
      when ms.current_active_default_count = 1 then 'REVIEW'
      else 'BLOCK'
    end,
    format('rows=%s', ms.current_active_default_count),
    'If one exists, a second active default cannot be inserted; choose a dedicated User A or an explicit default-switch plan.'
  from membership_state ms

  union all

  select
    90,
    'membership',
    'effective organization memberships in current default tenant',
    'INFO',
    format(
      'effective=%s, primary=%s',
      oms.effective_organization_membership_count,
      oms.effective_primary_organization_count
    ),
    'Inventory only; setup must not modify existing organization assignments.'
  from organization_membership_state oms

  union all

  select
    100,
    'authorization',
    'effective roles in current default tenant',
    'INFO',
    format(
      'effective=%s, tenant_wide=%s',
      rs.effective_role_count,
      rs.effective_tenant_wide_role_count
    ),
    'Inventory only; validation roles must be isolated from existing roles.'
  from role_state rs

  union all

  select
    110,
    'authorization',
    'required permissions already effective in current default tenant',
    'INFO',
    format(
      'effective_required_permissions=%s of 5',
      eps.effective_required_permission_count
    ),
    'Existing access is not reused as proof of the controlled validation role.'
  from effective_permission_state eps

  union all

  select
    120,
    'authorization',
    'required permission catalog',
    case when pcs.present_count = 5 then 'PASS' else 'BLOCK' end,
    format(
      'present=%s of 5, missing=%s',
      pcs.present_count,
      pcs.missing_codes
    ),
    'Setup requires the five exact permission codes from migration 009.'
  from permission_catalog_state pcs

  union all

  select
    130,
    'schema',
    'six limited views exist',
    case when vs.present_count = 6 then 'PASS' else 'BLOCK' end,
    format('present=%s of 6', vs.present_count),
    'Missing views indicate migrations 114-117 are not fully applied.'
  from view_state vs

  union all

  select
    140,
    'schema',
    'view security options',
    case when vs.hardened_count = 6 then 'PASS' else 'BLOCK' end,
    format('security_barrier_and_invoker=%s of 6', vs.hardened_count),
    'Every view must use SECURITY BARRIER and SECURITY INVOKER.'
  from view_state vs

  union all

  select
    150,
    'schema',
    'view role grants',
    case when vs.correct_view_grant_count = 6 then 'PASS' else 'BLOCK' end,
    format('correct_grants=%s of 6', vs.correct_view_grant_count),
    'Expected: anon denied, authenticated allowed, service_role denied.'
  from view_state vs

  union all

  select
    160,
    'schema',
    'protected base-table RLS',
    case
      when bts.present_count = 6 and bts.forced_rls_count = 6 then 'PASS'
      else 'BLOCK'
    end,
    format(
      'present=%s of 6, forced_rls=%s of 6',
      bts.present_count,
      bts.forced_rls_count
    ),
    'The six SECURITY INVOKER views depend on enabled and forced RLS.'
  from base_table_state bts

  union all

  select
    170,
    'schema',
    'protected base-table column grants',
    case
      when cgs.missing_authenticated_grant_count = 0
        and cgs.unexpected_authenticated_grant_count = 0
        and cgs.anon_selectable_base_table_count = 0
        then 'PASS'
      else 'BLOCK'
    end,
    format(
      'missing_authenticated=%s, unexpected_authenticated=%s, anon_tables=%s',
      cgs.missing_authenticated_grant_count,
      cgs.unexpected_authenticated_grant_count,
      cgs.anon_selectable_base_table_count
    ),
    'Migration 117 allows only reviewed columns and no anon base-table SELECT.'
  from column_grant_state cgs

  union all

  select
    180,
    'schema',
    'authorization helper functions',
    case when fs.present_count = 6 then 'PASS' else 'BLOCK' end,
    format(
      'present=%s of 6, missing=%s',
      fs.present_count,
      fs.missing_functions
    ),
    'The final view predicates depend on these exact function signatures.'
  from function_state fs

  union all

  select
    190,
    'collision',
    'reserved Tenant A/B codes are unused',
    case when rts.collision_count = 0 then 'PASS' else 'BLOCK' end,
    format('collisions=%s', rts.collision_count),
    'Existing tenants are never reused or overwritten by setup.'
  from reserved_tenant_state rts

  union all

  select
    200,
    'collision',
    'validation marker is unused',
    case
      when vms.ai_marker_count = 0 and vms.audit_marker_count = 0 then 'PASS'
      else 'BLOCK'
    end,
    format(
      'ai_rows=%s, audit_rows=%s',
      vms.ai_marker_count,
      vms.audit_marker_count
    ),
    'A prior incomplete validation run must be cleaned up before setup.'
  from validation_marker_state vms

  union all

  select
    210 + row_number() over (order by si.source_name)::integer,
    'existing data',
    si.source_name,
    'INFO',
    format('current_default_tenant_rows=%s', si.row_count),
    'Count only. Existing business rows must not be reused or deleted.'
  from source_inventory si

  union all

  select
    999,
    'decision',
    'precheck gate',
    gs.result,
    case gs.result
      when 'READY' then 'safe to design setup using existing User A'
      when 'REVIEW' then 'existing default membership requires a user/default strategy'
      else 'resolve BLOCK rows before setup'
    end,
    'No data has been changed; this is the gate for creating 02_setup.sql.'
  from gate_state gs
)
select
  section,
  check_name,
  result,
  observed,
  impact
from checks
order by sort_order;
