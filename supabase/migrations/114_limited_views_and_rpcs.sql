-- SES Navigator
-- Migration: 114_limited_views_and_rpcs
-- Purpose: Expose reviewed, least-privilege views and RPCs for sensitive data.

begin;

-- Audit snapshots can contain secrets copied from arbitrary business rows.
-- Keep this helper outside the Data API and recursively redact common secret
-- and personal-data keys before an audit payload is returned to a client.
create or replace function private.redact_sensitive_jsonb(p_value jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
declare
  result jsonb;
begin
  if p_value is null then
    return null;
  end if;

  case jsonb_typeof(p_value)
    when 'object' then
      select coalesce(
        jsonb_object_agg(
          entry.key,
          case
            when lower(entry.key) = any (array[
              'password',
              'token',
              'access_token',
              'refresh_token',
              'authorization',
              'api_key',
              'service_role_key',
              'secret',
              'secret_reference',
              'personal_email',
              'email',
              'phone',
              'postal_code',
              'address',
              'address_line',
              'emergency_contact',
              'bank_account_number',
              'bank_account_holder',
              'source_ip',
              'user_agent',
              'document_path',
              'file_storage_path',
              'receipt_path',
              'content_text',
              'extracted_text',
              'raw_text',
              'raw_payload'
            ])
              then to_jsonb('[REDACTED]'::text)
            else private.redact_sensitive_jsonb(entry.value)
          end
        ),
        '{}'::jsonb
      )
      into result
      from jsonb_each(p_value) as entry;
    when 'array' then
      select coalesce(
        jsonb_agg(private.redact_sensitive_jsonb(item.value)),
        '[]'::jsonb
      )
      into result
      from jsonb_array_elements(p_value) as item;
    else
      result := p_value;
  end case;

  return result;
end
$$;

revoke all on function private.redact_sensitive_jsonb(jsonb)
  from public, anon, authenticated;
grant execute on function private.redact_sensitive_jsonb(jsonb)
  to service_role;

-- Views are security-definer by PostgreSQL default. Every view is a security
-- barrier and repeats the applicable authorization predicate explicitly.
-- This permits selected columns to be exposed without granting the caller
-- direct SELECT on the protected app/audit base tables.
create or replace view public.engineer_private_summaries
with (security_barrier = true)
as
select
  d.engineer_id,
  d.birth_date,
  d.gender,
  d.prefecture,
  d.city,
  d.updated_at
from app.engineer_private_details d
where auth.uid() is not null
  and app.can_access_engineer(
    d.engineer_id,
    'engineer.private.read',
    'view'
  );

create or replace view public.contract_summaries
with (security_barrier = true)
as
select
  c.id,
  c.contract_no,
  c.project_id,
  c.proposal_id,
  c.engineer_id,
  c.contract_type,
  c.status,
  c.title,
  c.start_date,
  c.end_date,
  c.auto_renew,
  c.currency,
  c.updated_at,
  c.row_version
from app.contracts c
where auth.uid() is not null
  and c.deleted_at is null
  and app.can_access_contract(c.id, 'contract.read', 'view');

create or replace view public.finance_invoice_summaries
with (security_barrier = true)
as
select
  i.id,
  i.invoice_no,
  i.invoice_type,
  i.contract_id,
  i.billing_company_id,
  i.billing_period_start,
  i.billing_period_end,
  i.issue_date,
  i.due_date,
  i.status,
  i.currency,
  i.subtotal,
  i.tax_amount,
  i.total_amount,
  i.paid_amount,
  i.sent_at,
  i.updated_at,
  i.row_version
from app.invoices i
where auth.uid() is not null
  and i.deleted_at is null
  and app.can_access_invoice(i.id, 'finance.read', 'view');

create or replace view public.finance_expense_summaries
with (security_barrier = true)
as
select
  e.id,
  e.contract_id,
  e.work_log_id,
  e.engineer_id,
  e.expense_date,
  e.expense_type,
  e.description,
  e.amount,
  e.tax_amount,
  e.currency,
  e.status,
  e.billable,
  e.invoice_id,
  e.approved_at,
  e.updated_at,
  e.row_version
from app.expense_records e
where auth.uid() is not null
  and e.deleted_at is null
  and e.tenant_id = app.current_tenant_id()
  and app.has_permission('finance.read')
  and (
    (
      e.invoice_id is not null
      and app.can_access_invoice(e.invoice_id, 'finance.read', 'view')
    )
    or (
      e.contract_id is not null
      and app.can_access_contract(e.contract_id, 'finance.read', 'view')
    )
    or e.created_by = auth.uid()
  );

create or replace view public.ai_execution_summaries
with (security_barrier = true)
as
select
  a.id,
  a.job_id,
  a.execution_type,
  a.provider,
  a.model_name,
  a.prompt_version,
  a.status,
  a.requested_by,
  a.requested_at,
  a.started_at,
  a.completed_at,
  a.input_tokens,
  a.output_tokens,
  a.estimated_cost,
  a.currency,
  a.error_code,
  a.created_at,
  a.updated_at,
  a.row_version
from app.ai_executions a
where auth.uid() is not null
  and a.tenant_id = app.current_tenant_id()
  and app.has_permission('ai.read')
  and (
    a.requested_by = auth.uid()
    or app.has_permission('ai.read', null)
    or app.has_permission('ai.review', null)
  );

create or replace view public.audit_event_summaries
with (security_barrier = true)
as
select
  l.id,
  l.occurred_at,
  l.actor_user_id,
  l.actor_type,
  l.action,
  l.resource_type,
  l.resource_id,
  l.request_id,
  l.created_at
from audit.audit_logs l
where auth.uid() is not null
  and (
    app.is_system_admin()
    or (
      l.tenant_id = app.current_tenant_id()
      and app.has_permission('audit.read', null)
    )
  );

-- A private-detail RPC returns one engineer record only after the same
-- engineer-specific authorization used by RLS has succeeded.
create or replace function public.get_engineer_private_detail(
  p_engineer_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  result jsonb;
begin
  if auth.uid() is null
     or not app.can_access_engineer(
       p_engineer_id,
       'engineer.private.read',
       'view'
     )
  then
    raise exception 'engineer private detail is not accessible'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'engineer_id', d.engineer_id,
    'birth_date', d.birth_date,
    'gender', d.gender,
    'personal_email', d.personal_email,
    'phone', d.phone,
    'postal_code', d.postal_code,
    'prefecture', d.prefecture,
    'city', d.city,
    'address_line', d.address_line,
    'emergency_contact', d.emergency_contact,
    'notes', d.notes,
    'created_at', d.created_at,
    'updated_at', d.updated_at
  )
  into result
  from app.engineer_private_details d
  where d.engineer_id = p_engineer_id
    and d.tenant_id = app.current_tenant_id();

  return result;
end
$$;

-- Contract detail excludes source document paths, immutable contract_data, and
-- actor IDs. It returns reviewed current terms plus safe party/version/work-log
-- summaries.
create or replace function public.get_contract_detail(
  p_contract_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  result jsonb;
begin
  if auth.uid() is null
     or not app.can_access_contract(
       p_contract_id,
       'contract.read',
       'view'
     )
  then
    raise exception 'contract is not accessible'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
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
    'monthly_amount', c.monthly_amount,
    'hourly_amount', c.hourly_amount,
    'settlement_lower_hours', c.settlement_lower_hours,
    'settlement_upper_hours', c.settlement_upper_hours,
    'payment_terms', c.payment_terms,
    'notes', c.notes,
    'updated_at', c.updated_at,
    'row_version', c.row_version,
    'parties', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'company_id', p.company_id,
            'contact_id', p.contact_id,
            'party_role', p.party_role,
            'billing_role', p.billing_role,
            'is_primary', p.is_primary
          )
          order by p.is_primary desc, p.party_role, p.id
        )
        from app.contract_parties p
        where p.contract_id = c.id
          and p.tenant_id = c.tenant_id
          and p.deleted_at is null
      ),
      '[]'::jsonb
    ),
    'versions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'version_no', v.version_no,
            'effective_from', v.effective_from,
            'effective_to', v.effective_to,
            'change_summary', v.change_summary,
            'approved_at', v.approved_at,
            'created_at', v.created_at
          )
          order by v.version_no desc
        )
        from app.contract_versions v
        where v.contract_id = c.id
          and v.tenant_id = c.tenant_id
      ),
      '[]'::jsonb
    ),
    'work_logs', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', w.id,
            'engineer_id', w.engineer_id,
            'work_month', w.work_month,
            'status', w.status,
            'scheduled_days', w.scheduled_days,
            'actual_days', w.actual_days,
            'scheduled_hours', w.scheduled_hours,
            'actual_hours', w.actual_hours,
            'overtime_hours', w.overtime_hours,
            'absence_hours', w.absence_hours,
            'customer_approved_at', w.customer_approved_at,
            'updated_at', w.updated_at,
            'row_version', w.row_version
          )
          order by w.work_month desc
        )
        from app.work_logs w
        where w.contract_id = c.id
          and w.tenant_id = c.tenant_id
          and w.deleted_at is null
      ),
      '[]'::jsonb
    )
  )
  into result
  from app.contracts c
  where c.id = p_contract_id
    and c.tenant_id = app.current_tenant_id()
    and c.deleted_at is null;

  return result;
end
$$;

-- Finance detail intentionally omits bank account numbers, document/receipt
-- paths, payment references, free-form notes, and invoice item metadata.
create or replace function public.get_invoice_detail(
  p_invoice_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  result jsonb;
begin
  if auth.uid() is null
     or not app.can_access_invoice(
       p_invoice_id,
       'finance.read',
       'view'
     )
  then
    raise exception 'invoice is not accessible'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', i.id,
    'invoice_no', i.invoice_no,
    'invoice_type', i.invoice_type,
    'contract_id', i.contract_id,
    'billing_account', jsonb_build_object(
      'id', b.id,
      'company_id', b.company_id,
      'account_type', b.account_type,
      'account_name', b.account_name,
      'closing_day', b.closing_day,
      'payment_month_offset', b.payment_month_offset,
      'payment_day', b.payment_day,
      'invoice_delivery_method', b.invoice_delivery_method,
      'is_default', b.is_default
    ),
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
    'row_version', i.row_version,
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', item.id,
            'line_no', item.line_no,
            'item_type', item.item_type,
            'description', item.description,
            'quantity', item.quantity,
            'unit', item.unit,
            'unit_price', item.unit_price,
            'tax_rate', item.tax_rate,
            'amount', item.amount,
            'tax_amount', item.tax_amount,
            'work_log_id', item.work_log_id,
            'display_order', item.display_order
          )
          order by item.display_order, item.line_no
        )
        from app.invoice_items item
        where item.invoice_id = i.id
          and item.tenant_id = i.tenant_id
          and item.deleted_at is null
      ),
      '[]'::jsonb
    ),
    'payments', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'payment_type', p.payment_type,
            'payment_date', p.payment_date,
            'amount', p.amount,
            'currency', p.currency,
            'payment_method', p.payment_method,
            'bank_fee_amount', p.bank_fee_amount
          )
          order by p.payment_date desc, p.id
        )
        from app.payments p
        where p.invoice_id = i.id
          and p.tenant_id = i.tenant_id
          and p.deleted_at is null
      ),
      '[]'::jsonb
    )
  )
  into result
  from app.invoices i
  join app.billing_accounts b
    on b.id = i.billing_account_id
   and b.tenant_id = i.tenant_id
  where i.id = p_invoice_id
    and i.tenant_id = app.current_tenant_id()
    and i.deleted_at is null;

  return result;
end
$$;

-- Raw AI inputs stay closed. This RPC returns reviewed output content and
-- review state for one execution after request-owner/read/reviewer checks.
create or replace function public.get_ai_execution_output(
  p_ai_execution_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  result jsonb;
begin
  if auth.uid() is null
     or not exists (
       select 1
       from app.ai_executions a
       where a.id = p_ai_execution_id
         and a.tenant_id = app.current_tenant_id()
         and app.has_permission('ai.read')
         and (
           a.requested_by = auth.uid()
           or app.has_permission('ai.read', null)
           or app.has_permission('ai.review', null)
         )
     )
  then
    raise exception 'AI execution output is not accessible'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', a.id,
    'execution_type', a.execution_type,
    'provider', a.provider,
    'model_name', a.model_name,
    'prompt_version', a.prompt_version,
    'status', a.status,
    'requested_by', a.requested_by,
    'requested_at', a.requested_at,
    'completed_at', a.completed_at,
    'outputs', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'output_type', o.output_type,
            'sequence_no', o.sequence_no,
            'content_text', o.content_text,
            'content_json', o.content_json,
            'confidence_score', o.confidence_score,
            'schema_version', o.schema_version,
            'created_at', o.created_at
          )
          order by o.sequence_no, o.id
        )
        from app.ai_execution_outputs o
        where o.ai_execution_id = a.id
          and o.tenant_id = a.tenant_id
      ),
      '[]'::jsonb
    ),
    'reviews', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'reviewer_id', r.reviewer_id,
            'review_status', r.review_status,
            'reviewed_at', r.reviewed_at,
            'review_comment', r.review_comment,
            'approved_output_ids', r.approved_output_ids,
            'rejected_output_ids', r.rejected_output_ids,
            'created_at', r.created_at,
            'updated_at', r.updated_at,
            'row_version', r.row_version
          )
          order by r.created_at desc
        )
        from app.ai_execution_reviews r
        where r.ai_execution_id = a.id
          and r.tenant_id = a.tenant_id
      ),
      '[]'::jsonb
    )
  )
  into result
  from app.ai_executions a
  where a.id = p_ai_execution_id
    and a.tenant_id = app.current_tenant_id();

  return result;
end
$$;

-- Audit detail omits network/user-agent columns and recursively redacts
-- sensitive fields from snapshots and metadata.
create or replace function public.get_audit_event_detail(
  p_audit_log_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  allowed boolean;
  result jsonb;
begin
  select
    app.is_system_admin()
    or (
      l.tenant_id = app.current_tenant_id()
      and app.has_permission('audit.read', null)
    )
  into allowed
  from audit.audit_logs l
  where l.id = p_audit_log_id;

  if auth.uid() is null or coalesce(allowed, false) is not true then
    raise exception 'audit event is not accessible'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', l.id,
    'occurred_at', l.occurred_at,
    'actor_user_id', l.actor_user_id,
    'actor_type', l.actor_type,
    'action', l.action,
    'resource_type', l.resource_type,
    'resource_id', l.resource_id,
    'request_id', l.request_id,
    'before_data', private.redact_sensitive_jsonb(l.before_data),
    'after_data', private.redact_sensitive_jsonb(l.after_data),
    'metadata', private.redact_sensitive_jsonb(l.metadata),
    'created_at', l.created_at
  )
  into result
  from audit.audit_logs l
  where l.id = p_audit_log_id;

  return result;
end
$$;

revoke all on table
  public.engineer_private_summaries,
  public.contract_summaries,
  public.finance_invoice_summaries,
  public.finance_expense_summaries,
  public.ai_execution_summaries,
  public.audit_event_summaries
from public, anon, authenticated;

grant select on table
  public.engineer_private_summaries,
  public.contract_summaries,
  public.finance_invoice_summaries,
  public.finance_expense_summaries,
  public.ai_execution_summaries,
  public.audit_event_summaries
to authenticated;

revoke all on function
  public.get_engineer_private_detail(uuid),
  public.get_contract_detail(uuid),
  public.get_invoice_detail(uuid),
  public.get_ai_execution_output(uuid),
  public.get_audit_event_detail(uuid)
from public, anon, authenticated;

grant execute on function
  public.get_engineer_private_detail(uuid),
  public.get_contract_detail(uuid),
  public.get_invoice_detail(uuid),
  public.get_ai_execution_output(uuid),
  public.get_audit_event_detail(uuid)
to authenticated, service_role;

comment on view public.engineer_private_summaries is
  'Column-limited engineer private data; requires engineer.private.read and record access.';
comment on view public.contract_summaries is
  'Contract list without commercial terms or source document fields.';
comment on view public.finance_invoice_summaries is
  'Invoice list without bank, document, note, item, or payment detail.';
comment on view public.finance_expense_summaries is
  'Expense list without receipts, notes, or approval actor fields.';
comment on view public.ai_execution_summaries is
  'AI execution metadata without raw inputs, outputs, errors, or arbitrary metadata.';
comment on view public.audit_event_summaries is
  'Audit event metadata without snapshots, network data, user agents, or arbitrary metadata.';

comment on function public.get_engineer_private_detail(uuid) is
  'Returns one authorized engineer private-detail record.';
comment on function public.get_contract_detail(uuid) is
  'Returns one authorized contract with safe party, version, and work-log summaries.';
comment on function public.get_invoice_detail(uuid) is
  'Returns one authorized invoice with safe item and payment detail.';
comment on function public.get_ai_execution_output(uuid) is
  'Returns authorized AI outputs and review state; raw inputs remain private.';
comment on function public.get_audit_event_detail(uuid) is
  'Returns one authorized audit event with recursively redacted JSON snapshots.';

commit;
