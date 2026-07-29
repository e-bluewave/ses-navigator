-- SES Navigator
-- Migration: 116_service_rpc_error_handling
-- Purpose: Return a stable HTTP 404 from the service-role RPC when a resource
--          is absent or does not belong to the specified tenant.

begin;

-- Keep the service boundary and response shape introduced by 115 unchanged.
-- PostgREST maps PT404 to HTTP 404. The generic response intentionally does
-- not distinguish a missing resource from a tenant/resource mismatch.
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
    raise sqlstate 'PT404'
      using message = 'Not Found';
  end if;

  return result;
end
$$;

-- Reassert the allow-list after replacing the function. CREATE OR REPLACE
-- normally preserves grants, but these statements make the intended boundary
-- explicit and self-contained.
revoke execute on function public.service_get_sensitive_record(
  uuid,
  text,
  uuid
)
from public, anon, authenticated;

grant execute on function public.service_get_sensitive_record(
  uuid,
  text,
  uuid
)
to service_role;

comment on function public.service_get_sensitive_record(uuid, text, uuid) is
  'Service-role-only, tenant-scoped access to allow-listed redacted records; inaccessible resources return HTTP 404.';

-- Fail atomically if the replacement changes the service-role boundary or no
-- longer emits the SQLSTATE that PostgREST maps to HTTP 404.
do $$
declare
  function_definition text;
  test_sqlstate text;
  test_message text;
  test_tenant_id uuid := gen_random_uuid();
  test_resource_id uuid := gen_random_uuid();
begin
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

  select pg_catalog.pg_get_functiondef(
    'public.service_get_sensitive_record(uuid,text,uuid)'::regprocedure
  )
  into function_definition;

  if function_definition not like '%PT404%'
     or function_definition like '%P0002%' then
    raise exception 'service RPC does not use the required PT404 SQLSTATE';
  end if;

  -- Exercise the absent-resource path as service_role. Random identifiers make
  -- this test independent of application data without creating test records.
  execute 'set local role service_role';

  begin
    perform public.service_get_sensitive_record(
      test_tenant_id,
      'contract',
      test_resource_id
    );
  exception
    when others then
      get stacked diagnostics
        test_sqlstate = returned_sqlstate,
        test_message = message_text;
  end;

  execute 'reset role';

  if test_sqlstate is distinct from 'PT404'
     or test_message is distinct from 'Not Found' then
    raise exception
      'service RPC absent-resource response is invalid: SQLSTATE %, message %',
      coalesce(test_sqlstate, '<none>'),
      coalesce(test_message, '<none>');
  end if;
end
$$;

commit;
