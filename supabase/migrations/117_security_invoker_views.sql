-- SES Navigator
-- Migration: 117_security_invoker_views
-- Purpose: Run the six limited public views with the caller's privileges and
--          RLS policies instead of the view owner's privileges.

begin;

-- SECURITY INVOKER makes PostgreSQL evaluate base-table permissions and RLS as
-- the calling role. Keep SECURITY BARRIER enabled to prevent unsafe predicate
-- reordering across the authorization filters defined by migration 114.
alter view public.engineer_private_summaries
  set (security_invoker = true);
alter view public.contract_summaries
  set (security_invoker = true);
alter view public.finance_invoice_summaries
  set (security_invoker = true);
alter view public.finance_expense_summaries
  set (security_invoker = true);
alter view public.ai_execution_summaries
  set (security_invoker = true);
alter view public.audit_event_summaries
  set (security_invoker = true);

-- Migration 113 intentionally withheld these sensitive base tables from
-- authenticated. SECURITY INVOKER requires the caller to hold privileges on
-- every base column referenced by each view, including authorization filters.
-- Grant only those columns; omitted sensitive columns remain unreadable.
grant usage on schema app, audit to authenticated;

revoke select on table
  app.engineer_private_details,
  app.contracts,
  app.invoices,
  app.expense_records,
  app.ai_executions,
  audit.audit_logs
from authenticated;

grant select (
  engineer_id,
  birth_date,
  gender,
  prefecture,
  city,
  updated_at
) on app.engineer_private_details to authenticated;

grant select (
  id,
  contract_no,
  project_id,
  proposal_id,
  engineer_id,
  contract_type,
  status,
  title,
  start_date,
  end_date,
  auto_renew,
  currency,
  updated_at,
  row_version,
  deleted_at
) on app.contracts to authenticated;

grant select (
  id,
  invoice_no,
  invoice_type,
  contract_id,
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
  sent_at,
  updated_at,
  row_version,
  deleted_at
) on app.invoices to authenticated;

grant select (
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
  approved_at,
  updated_at,
  row_version,
  deleted_at,
  created_by
) on app.expense_records to authenticated;

grant select (
  id,
  tenant_id,
  job_id,
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
  error_code,
  created_at,
  updated_at,
  row_version
) on app.ai_executions to authenticated;

grant select (
  id,
  tenant_id,
  occurred_at,
  actor_user_id,
  actor_type,
  action,
  resource_type,
  resource_id,
  request_id,
  created_at
) on audit.audit_logs to authenticated;

comment on view public.engineer_private_summaries is
  'SECURITY INVOKER column-limited engineer private data; requires engineer.private.read and record access.';
comment on view public.contract_summaries is
  'SECURITY INVOKER contract list without commercial terms or source document fields.';
comment on view public.finance_invoice_summaries is
  'SECURITY INVOKER invoice list without bank, document, note, or payment-reference fields.';
comment on view public.finance_expense_summaries is
  'SECURITY INVOKER expense list without receipt paths, notes, or actor identifiers.';
comment on view public.ai_execution_summaries is
  'SECURITY INVOKER AI execution metadata without raw input, output content, or provider payloads.';
comment on view public.audit_event_summaries is
  'SECURITY INVOKER audit event list without snapshots, metadata, IP addresses, or user agents.';

-- Fail atomically if a view loses either safety option, if RLS is not forced
-- on a base table, or if a grant exposes a column outside the reviewed view
-- boundary.
do $$
declare
  protected_view regclass;
  protected_table regclass;
  grant_spec record;
begin
  foreach protected_view in array array[
    'public.engineer_private_summaries'::regclass,
    'public.contract_summaries'::regclass,
    'public.finance_invoice_summaries'::regclass,
    'public.finance_expense_summaries'::regclass,
    'public.ai_execution_summaries'::regclass,
    'public.audit_event_summaries'::regclass
  ]
  loop
    if not coalesce(
      (
        select c.reloptions @> array[
          'security_barrier=true',
          'security_invoker=true'
        ]
        from pg_catalog.pg_class c
        where c.oid = protected_view
          and c.relkind = 'v'
      ),
      false
    ) then
      raise exception
        'view % must use SECURITY BARRIER and SECURITY INVOKER',
        protected_view;
    end if;

    if has_table_privilege('anon', protected_view, 'SELECT')
       or not has_table_privilege(
         'authenticated',
         protected_view,
         'SELECT'
       )
       or has_table_privilege('service_role', protected_view, 'SELECT')
    then
      raise exception 'view grants are invalid for %', protected_view;
    end if;
  end loop;

  foreach protected_table in array array[
    'app.engineer_private_details'::regclass,
    'app.contracts'::regclass,
    'app.invoices'::regclass,
    'app.expense_records'::regclass,
    'app.ai_executions'::regclass,
    'audit.audit_logs'::regclass
  ]
  loop
    if not coalesce(
      (
        select c.relrowsecurity and c.relforcerowsecurity
        from pg_catalog.pg_class c
        where c.oid = protected_table
          and c.relkind in ('r', 'p')
      ),
      false
    ) then
      raise exception 'RLS must be enabled and forced on %', protected_table;
    end if;

    if has_any_column_privilege('anon', protected_table, 'SELECT') then
      raise exception 'anon can select from protected table %', protected_table;
    end if;
  end loop;

  for grant_spec in
    select *
    from (
      values
        (
          'app.engineer_private_details'::regclass,
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
          'app.contracts'::regclass,
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
          'app.invoices'::regclass,
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
          'app.expense_records'::regclass,
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
          'app.ai_executions'::regclass,
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
          'audit.audit_logs'::regclass,
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
    ) as required_grants(table_oid, column_names)
  loop
    if exists (
      select 1
      from unnest(grant_spec.column_names) as required_column(column_name)
      where not has_column_privilege(
        'authenticated',
        grant_spec.table_oid,
        required_column.column_name,
        'SELECT'
      )
    ) then
      raise exception
        'authenticated is missing a required column grant on %',
        grant_spec.table_oid;
    end if;

    if exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = grant_spec.table_oid
        and a.attnum > 0
        and not a.attisdropped
        and a.attname <> all (grant_spec.column_names)
        and has_column_privilege(
          'authenticated',
          grant_spec.table_oid,
          a.attname,
          'SELECT'
        )
    ) then
      raise exception
        'authenticated can select an unreviewed column on %',
        grant_spec.table_oid;
    end if;
  end loop;
end
$$;

commit;
