-- SES Navigator
-- Migration: 115_data_api_hardening
-- Purpose: Remove extension functions from the Data API surface and add an
--          explicit, tenant-scoped service_role boundary.

begin;

-- Data API exposes only the public and graphql_public schemas. Extensions
-- installed into public therefore become RPC candidates even when the
-- application did not intentionally publish them. Keep extension objects in
-- Supabase's non-exposed extensions schema.
create schema if not exists extensions;

do $$
declare
  extension_name text;
begin
  foreach extension_name in array array[
    'citext',
    'pg_trgm',
    'unaccent',
    'vector'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_extension e
      where e.extname = extension_name
    ) then
      raise exception 'required extension % is not installed',
        extension_name;
    elsif exists (
      select 1
      from pg_catalog.pg_extension e
      join pg_catalog.pg_namespace n
        on n.oid = e.extnamespace
      where e.extname = extension_name
        and n.nspname <> 'extensions'
    ) then
      if not exists (
        select 1
        from pg_catalog.pg_extension e
        where e.extname = extension_name
          and e.extrelocatable
      ) then
        raise exception 'extension % cannot be moved to extensions schema',
          extension_name;
      end if;

      execute format(
        'alter extension %I set schema extensions',
        extension_name
      );
    end if;
  end loop;
end
$$;

-- normalize_text() calls unaccent() without a schema qualifier. Pin its
-- function-local search path after relocating unaccent so normal database
-- sessions do not depend on the Data API extra_search_path setting.
alter function app.normalize_text(text)
  set search_path = pg_catalog, extensions;

-- Permission checks compare the citext permission code with a text argument.
-- Keep the relocated citext operators visible inside these SECURITY DEFINER
-- functions without relying on the caller's search path.
alter function app.has_permission(text)
  set search_path = pg_catalog, public, extensions;

alter function app.has_permission(text, uuid)
  set search_path = pg_catalog, public, extensions;

-- service_role remains unable to reach app or audit through Data API because
-- those schemas are intentionally not exposed. This allow-listed RPC provides
-- a narrow read boundary for trusted server-side operations. SECURITY INVOKER
-- preserves current_user = service_role and uses the grants established by 113.
-- Both tenant ID and resource ID are mandatory to prevent implicit cross-tenant
-- lookups.
create or replace function public.service_get_sensitive_record(
  p_tenant_id uuid,
  p_resource_type text,
  p_resource_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  result jsonb;
begin
  if current_user <> 'service_role' then
    raise exception 'service role is required'
      using errcode = '42501';
  end if;

  if p_tenant_id is null or p_resource_id is null then
    raise exception 'tenant ID and resource ID are required'
      using errcode = '22004';
  end if;

  case p_resource_type
    when 'engineer_private' then
      select jsonb_build_object(
        'resource_type', 'engineer_private',
        'tenant_id', d.tenant_id,
        'engineer_id', d.engineer_id,
        'birth_date', d.birth_date,
        'gender', d.gender,
        'prefecture', d.prefecture,
        'city', d.city,
        'updated_at', d.updated_at
      )
      into result
      from app.engineer_private_details d
      where d.tenant_id = p_tenant_id
        and d.engineer_id = p_resource_id;

    when 'contract' then
      select jsonb_build_object(
        'resource_type', 'contract',
        'tenant_id', c.tenant_id,
        'id', c.id,
        'contract_no', c.contract_no,
        'project_id', c.project_id,
        'proposal_id', c.proposal_id,
        'engineer_id', c.engineer_id,
        'contract_type', c.contract_type,
        'status', c.status,
        'title', c.title,
        'start_date', c.start_date,
        'end_date', c.end_date,
        'auto_renew', c.auto_renew,
        'currency', c.currency,
        'updated_at', c.updated_at,
        'row_version', c.row_version
      )
      into result
      from app.contracts c
      where c.tenant_id = p_tenant_id
        and c.id = p_resource_id
        and c.deleted_at is null;

    when 'invoice' then
      select jsonb_build_object(
        'resource_type', 'invoice',
        'tenant_id', i.tenant_id,
        'id', i.id,
        'invoice_no', i.invoice_no,
        'invoice_type', i.invoice_type,
        'contract_id', i.contract_id,
        'billing_company_id', i.billing_company_id,
        'billing_period_start', i.billing_period_start,
        'billing_period_end', i.billing_period_end,
        'issue_date', i.issue_date,
        'due_date', i.due_date,
        'status', i.status,
        'currency', i.currency,
        'subtotal', i.subtotal,
        'tax_amount', i.tax_amount,
        'total_amount', i.total_amount,
        'paid_amount', i.paid_amount,
        'sent_at', i.sent_at,
        'updated_at', i.updated_at,
        'row_version', i.row_version
      )
      into result
      from app.invoices i
      where i.tenant_id = p_tenant_id
        and i.id = p_resource_id
        and i.deleted_at is null;

    when 'ai_execution' then
      select jsonb_build_object(
        'resource_type', 'ai_execution',
        'tenant_id', a.tenant_id,
        'id', a.id,
        'job_id', a.job_id,
        'execution_type', a.execution_type,
        'provider', a.provider,
        'model_name', a.model_name,
        'prompt_version', a.prompt_version,
        'status', a.status,
        'requested_by', a.requested_by,
        'requested_at', a.requested_at,
        'started_at', a.started_at,
        'completed_at', a.completed_at,
        'input_tokens', a.input_tokens,
        'output_tokens', a.output_tokens,
        'estimated_cost', a.estimated_cost,
        'currency', a.currency,
        'error_code', a.error_code,
        'created_at', a.created_at,
        'updated_at', a.updated_at,
        'row_version', a.row_version
      )
      into result
      from app.ai_executions a
      where a.tenant_id = p_tenant_id
        and a.id = p_resource_id;

    when 'audit_event' then
      select jsonb_build_object(
        'resource_type', 'audit_event',
        'tenant_id', l.tenant_id,
        'id', l.id,
        'occurred_at', l.occurred_at,
        'actor_user_id', l.actor_user_id,
        'actor_type', l.actor_type,
        'action', l.action,
        'resource_type_name', l.resource_type,
        'resource_id', l.resource_id,
        'request_id', l.request_id,
        'before_data', private.redact_sensitive_jsonb(l.before_data),
        'after_data', private.redact_sensitive_jsonb(l.after_data),
        'metadata', private.redact_sensitive_jsonb(l.metadata),
        'created_at', l.created_at
      )
      into result
      from audit.audit_logs l
      where l.tenant_id = p_tenant_id
        and l.id = p_resource_id;

    else
      raise exception 'unsupported resource type: %', p_resource_type
        using errcode = '22023';
  end case;

  if result is null then
    raise exception 'resource was not found in the specified tenant'
      using errcode = 'P0002';
  end if;

  return result;
end
$$;

-- public is an explicit API boundary. Reset function execution rights after
-- relocating extension functions, then re-grant only the reviewed client and
-- service endpoints. Existing service_role grants on user-context RPCs are
-- removed because those RPCs depend on auth.uid() and tenant membership.
revoke execute on all functions in schema public
  from public, anon, authenticated, service_role;

-- Keep service_role off the user-context views as well. Trusted server-side
-- reads of sensitive data must cross the explicit service RPC boundary below.
revoke all on table
  public.engineer_private_summaries,
  public.contract_summaries,
  public.finance_invoice_summaries,
  public.finance_expense_summaries,
  public.ai_execution_summaries,
  public.audit_event_summaries
from service_role;

grant execute on function
  public.get_engineer_private_detail(uuid),
  public.get_contract_detail(uuid),
  public.get_invoice_detail(uuid),
  public.get_ai_execution_output(uuid),
  public.get_audit_event_detail(uuid)
to authenticated;

grant execute on function public.service_get_sensitive_record(
  uuid,
  text,
  uuid
)
to service_role;

-- Future public RPCs must be reviewed and granted explicitly.
alter default privileges in schema public
  revoke execute on functions
  from public, anon, authenticated, service_role;

comment on function public.service_get_sensitive_record(uuid, text, uuid) is
  'Service-role-only, tenant-scoped access to an allow-list of redacted sensitive records.';

-- Fail the migration if the extension move or API grants do not match the
-- intended closed posture.
do $$
declare
  extension_name text;
  authenticated_rpc regprocedure;
  protected_view regclass;
begin
  foreach extension_name in array array[
    'citext',
    'pg_trgm',
    'unaccent',
    'vector'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_extension e
      where e.extname = extension_name
    ) then
      raise exception 'required extension % is not installed',
        extension_name;
    elsif exists (
      select 1
      from pg_catalog.pg_extension e
      join pg_catalog.pg_namespace n
        on n.oid = e.extnamespace
      where e.extname = extension_name
        and n.nspname <> 'extensions'
    ) then
      raise exception 'extension % is still exposed outside extensions schema',
        extension_name;
    end if;
  end loop;

  if has_function_privilege(
    'anon',
    'public.service_get_sensitive_record(uuid,text,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.service_get_sensitive_record(uuid,text,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.service_get_sensitive_record(uuid,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'service RPC execution grants are invalid';
  end if;

  if (
    select p.prosecdef
    from pg_catalog.pg_proc p
    where p.oid =
      'public.service_get_sensitive_record(uuid,text,uuid)'::regprocedure
  ) then
    raise exception 'service RPC must remain SECURITY INVOKER';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles r
    where r.rolname = 'service_role'
      and r.rolbypassrls
  ) then
    raise exception 'service_role must have BYPASSRLS for the invoker RPC';
  end if;

  foreach authenticated_rpc in array array[
    'public.get_engineer_private_detail(uuid)'::regprocedure,
    'public.get_contract_detail(uuid)'::regprocedure,
    'public.get_invoice_detail(uuid)'::regprocedure,
    'public.get_ai_execution_output(uuid)'::regprocedure,
    'public.get_audit_event_detail(uuid)'::regprocedure
  ]
  loop
    if has_function_privilege(
      'anon',
      authenticated_rpc,
      'EXECUTE'
    ) or not has_function_privilege(
      'authenticated',
      authenticated_rpc,
      'EXECUTE'
    ) or has_function_privilege(
      'service_role',
      authenticated_rpc,
      'EXECUTE'
    ) then
      raise exception 'authenticated RPC grants are invalid for %',
        authenticated_rpc;
    end if;
  end loop;

  foreach protected_view in array array[
    'public.engineer_private_summaries'::regclass,
    'public.contract_summaries'::regclass,
    'public.finance_invoice_summaries'::regclass,
    'public.finance_expense_summaries'::regclass,
    'public.ai_execution_summaries'::regclass,
    'public.audit_event_summaries'::regclass
  ]
  loop
    if has_table_privilege(
      'service_role',
      protected_view,
      'SELECT'
    ) then
      raise exception 'service_role can still select protected view %',
        protected_view;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        or (
          has_function_privilege('authenticated', p.oid, 'EXECUTE')
          and p.oid <> all (array[
            'public.get_engineer_private_detail(uuid)'::regprocedure,
            'public.get_contract_detail(uuid)'::regprocedure,
            'public.get_invoice_detail(uuid)'::regprocedure,
            'public.get_ai_execution_output(uuid)'::regprocedure,
            'public.get_audit_event_detail(uuid)'::regprocedure
          ]::oid[])
        )
        or (
          has_function_privilege('service_role', p.oid, 'EXECUTE')
          and p.oid <>
            'public.service_get_sensitive_record(uuid,text,uuid)'::regprocedure
        )
      )
  ) then
    raise exception 'an unreviewed public function is executable';
  end if;

  if app.normalize_text('  Tést  Text  ') <> 'test text' then
    raise exception 'normalize_text failed after moving unaccent';
  end if;
end
$$;

commit;
