-- SES Navigator
-- Migration: 142_invoice_read_rpcs
-- Purpose: Expose authorized invoice list and enriched detail reads without
--          granting authenticated users direct access to finance tables.

begin;

create or replace function public.list_invoice_summaries(
  p_query text default null,
  p_status text default null,
  p_invoice_type text default null,
  p_due_from date default null,
  p_due_to date default null,
  p_limit integer default 50,
  p_cursor_issue_date date default null,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  normalized_query text := nullif(btrim(p_query), '');
  result jsonb;
begin
  if auth.uid() is null or tenant is null
     or p_limit is null or p_limit < 1 or p_limit > 200
     or length(coalesce(normalized_query, '')) > 100
     or (p_status is not null and p_status not in (
       'draft','issued','sent','partially_paid','paid','overdue','cancelled','void'
     ))
     or (p_invoice_type is not null and p_invoice_type not in ('sales','purchase'))
     or (p_due_from is not null and p_due_to is not null and p_due_to < p_due_from)
     or ((p_cursor_issue_date is null) <> (p_cursor_updated_at is null))
     or ((p_cursor_updated_at is null) <> (p_cursor_id is null))
  then
    raise exception 'invalid invoice list request' using errcode = '22023';
  end if;

  with visible as (
    select
      i.id,
      i.invoice_no,
      i.invoice_type,
      i.contract_id,
      c.title as contract_title,
      i.billing_company_id,
      company.legal_name as billing_company_name,
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
      greatest(i.total_amount - i.paid_amount, 0) as balance_amount,
      i.sent_at,
      i.updated_at,
      i.row_version
    from app.invoices i
    join app.companies company
      on company.tenant_id = i.tenant_id
     and company.id = i.billing_company_id
     and company.deleted_at is null
    left join app.contracts c
      on c.tenant_id = i.tenant_id
     and c.id = i.contract_id
     and c.deleted_at is null
    where i.tenant_id = tenant
      and i.deleted_at is null
      and app.can_access_invoice(i.id, 'finance.read', 'view')
      and (p_status is null or i.status = p_status)
      and (p_invoice_type is null or i.invoice_type = p_invoice_type)
      and (p_due_from is null or i.due_date >= p_due_from)
      and (p_due_to is null or i.due_date <= p_due_to)
      and (
        normalized_query is null
        or i.invoice_no ilike '%' || normalized_query || '%'
        or company.legal_name ilike '%' || normalized_query || '%'
        or coalesce(c.title, '') ilike '%' || normalized_query || '%'
      )
      and (
        p_cursor_issue_date is null
        or (i.issue_date, i.updated_at, i.id) < (
          p_cursor_issue_date, p_cursor_updated_at, p_cursor_id
        )
      )
    order by i.issue_date desc, i.updated_at desc, i.id desc
    limit p_limit + 1
  ), page as (
    select * from visible
    order by issue_date desc, updated_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.issue_date desc, p.updated_at desc, p.id desc)
      from page p
    ), '[]'::jsonb),
    'next_cursor', case when (select count(*) from visible) > p_limit then (
      select jsonb_build_object(
        'issue_date', p.issue_date, 'updated_at', p.updated_at, 'id', p.id
      ) from page p order by p.issue_date, p.updated_at, p.id limit 1
    ) else null end
  ) into result;

  return result;
end
$$;

create or replace function public.get_invoice_detail(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  result jsonb;
begin
  if auth.uid() is null or tenant is null or p_invoice_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', i.id,
    'invoice_no', i.invoice_no,
    'invoice_type', i.invoice_type,
    'contract_id', i.contract_id,
    'contract_title', c.title,
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
    'billing_company_name', company.legal_name,
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
    'balance_amount', greatest(i.total_amount - i.paid_amount, 0),
    'sent_at', i.sent_at,
    'updated_at', i.updated_at,
    'row_version', i.row_version,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
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
      ) order by item.display_order, item.line_no)
      from app.invoice_items item
      where item.tenant_id = i.tenant_id
        and item.invoice_id = i.id
        and item.deleted_at is null
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'payment_type', p.payment_type,
        'payment_date', p.payment_date,
        'amount', p.amount,
        'currency', p.currency,
        'payment_method', p.payment_method,
        'bank_fee_amount', p.bank_fee_amount
      ) order by p.payment_date desc, p.id)
      from app.payments p
      where p.tenant_id = i.tenant_id
        and p.invoice_id = i.id
        and p.deleted_at is null
    ), '[]'::jsonb)
  ) into result
  from app.invoices i
  join app.billing_accounts b
    on b.tenant_id = i.tenant_id and b.id = i.billing_account_id and b.deleted_at is null
  join app.companies company
    on company.tenant_id = i.tenant_id and company.id = i.billing_company_id and company.deleted_at is null
  left join app.contracts c
    on c.tenant_id = i.tenant_id and c.id = i.contract_id and c.deleted_at is null
  where i.id = p_invoice_id
    and i.tenant_id = tenant
    and i.deleted_at is null
    and app.can_access_invoice(i.id, 'finance.read', 'view');

  if result is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return result;
end
$$;

revoke all on function public.list_invoice_summaries(text, text, text, date, date, integer, date, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.get_invoice_detail(uuid)
  from public, anon, authenticated;
grant execute on function public.list_invoice_summaries(text, text, text, date, date, integer, date, timestamptz, uuid)
  to authenticated;
grant execute on function public.get_invoice_detail(uuid)
  to authenticated;

comment on function public.list_invoice_summaries(text, text, text, date, date, integer, date, timestamptz, uuid) is
  'Returns an authorized cursor page of invoice summaries with company and outstanding balance.';
comment on function public.get_invoice_detail(uuid) is
  'Returns one authorized invoice with safe billing, line-item, and payment detail.';

commit;
