-- SES Navigator
-- Migration: 148_profitability_dashboard_rpc
-- Purpose: Return currency-safe monthly revenue, cost, gross-profit, cash,
--          and outstanding balance metrics for the finance dashboard.

begin;

create or replace function public.get_profitability_dashboard(
  p_from_month date,
  p_to_month date,
  p_currency text default 'JPY'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  currency_code text := upper(btrim(p_currency));
  result jsonb;
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('finance.read')
     or p_from_month is null or p_to_month is null
     or p_from_month <> date_trunc('month', p_from_month)::date
     or p_to_month <> date_trunc('month', p_to_month)::date
     or p_from_month > p_to_month
     or p_to_month > (p_from_month + interval '23 months')::date
     or currency_code !~ '^[A-Z]{3}$'
  then
    raise exception 'invalid profitability dashboard request' using errcode = '22023';
  end if;

  with months as (
    select generate_series(p_from_month, p_to_month, interval '1 month')::date period_month
  ), invoice_metrics as (
    select date_trunc('month', coalesce(i.billing_period_start, i.issue_date))::date period_month,
      sum(case when i.invoice_type = 'sales' then i.subtotal else 0 end) revenue,
      sum(case when i.invoice_type = 'purchase' then i.subtotal else 0 end) purchase_cost,
      sum(case when i.invoice_type = 'sales' then i.total_amount - i.paid_amount else 0 end) receivable_balance,
      sum(case when i.invoice_type = 'purchase' then i.total_amount - i.paid_amount else 0 end) payable_balance,
      count(*) filter (where i.invoice_type = 'sales')::integer sales_invoice_count,
      count(*) filter (where i.invoice_type = 'purchase')::integer purchase_invoice_count
    from app.invoices i
    where i.tenant_id = tenant and i.deleted_at is null
      and i.currency = currency_code
      and i.status in ('issued','sent','partially_paid','paid','overdue')
      and date_trunc('month', coalesce(i.billing_period_start, i.issue_date))::date
        between p_from_month and p_to_month
    group by 1
  ), expense_metrics as (
    select date_trunc('month', e.expense_date)::date period_month,
      sum(e.amount) expense_cost,
      count(*)::integer expense_count
    from app.expense_records e
    where e.tenant_id = tenant and e.deleted_at is null
      and e.currency = currency_code
      and e.status in ('approved','invoiced','reimbursed')
      and date_trunc('month', e.expense_date)::date between p_from_month and p_to_month
    group by 1
  ), payment_metrics as (
    select date_trunc('month', p.payment_date)::date period_month,
      sum(case when i.invoice_type = 'sales'
        then case when p.payment_type = 'refund' then -p.amount else p.amount end else 0 end) cash_in,
      sum(case when i.invoice_type = 'purchase'
        then case when p.payment_type = 'refund' then -p.amount else p.amount end else 0 end) cash_out
    from app.payments p
    join app.invoices i on i.tenant_id = p.tenant_id and i.id = p.invoice_id
    where p.tenant_id = tenant and p.deleted_at is null
      and p.currency = currency_code
      and date_trunc('month', p.payment_date)::date between p_from_month and p_to_month
    group by 1
  ), monthly as (
    select m.period_month,
      coalesce(i.revenue, 0) revenue,
      coalesce(i.purchase_cost, 0) purchase_cost,
      coalesce(e.expense_cost, 0) expense_cost,
      coalesce(i.revenue, 0) - coalesce(i.purchase_cost, 0) - coalesce(e.expense_cost, 0) gross_profit,
      case when coalesce(i.revenue, 0) = 0 then null
        else round(((coalesce(i.revenue, 0) - coalesce(i.purchase_cost, 0) - coalesce(e.expense_cost, 0)) / i.revenue) * 100, 2) end gross_margin_rate,
      coalesce(p.cash_in, 0) cash_in, coalesce(p.cash_out, 0) cash_out,
      coalesce(i.receivable_balance, 0) receivable_balance,
      coalesce(i.payable_balance, 0) payable_balance,
      coalesce(i.sales_invoice_count, 0) sales_invoice_count,
      coalesce(i.purchase_invoice_count, 0) purchase_invoice_count,
      coalesce(e.expense_count, 0) expense_count
    from months m
    left join invoice_metrics i on i.period_month = m.period_month
    left join expense_metrics e on e.period_month = m.period_month
    left join payment_metrics p on p.period_month = m.period_month
  )
  select jsonb_build_object(
    'from_month', p_from_month, 'to_month', p_to_month, 'currency', currency_code,
    'revenue', coalesce(sum(revenue), 0),
    'purchase_cost', coalesce(sum(purchase_cost), 0),
    'expense_cost', coalesce(sum(expense_cost), 0),
    'gross_profit', coalesce(sum(gross_profit), 0),
    'gross_margin_rate', case when coalesce(sum(revenue), 0) = 0 then null
      else round((sum(gross_profit) / sum(revenue)) * 100, 2) end,
    'cash_in', coalesce(sum(cash_in), 0), 'cash_out', coalesce(sum(cash_out), 0),
    'receivable_balance', coalesce(sum(receivable_balance), 0),
    'payable_balance', coalesce(sum(payable_balance), 0),
    'monthly', coalesce(jsonb_agg(jsonb_build_object(
      'period_month', period_month, 'revenue', revenue,
      'purchase_cost', purchase_cost, 'expense_cost', expense_cost,
      'gross_profit', gross_profit, 'gross_margin_rate', gross_margin_rate,
      'cash_in', cash_in, 'cash_out', cash_out,
      'receivable_balance', receivable_balance, 'payable_balance', payable_balance,
      'sales_invoice_count', sales_invoice_count,
      'purchase_invoice_count', purchase_invoice_count,
      'expense_count', expense_count
    ) order by period_month), '[]'::jsonb)
  ) into result from monthly;
  return result;
end
$$;

revoke all on function public.get_profitability_dashboard(date, date, text)
  from public, anon, authenticated;
grant execute on function public.get_profitability_dashboard(date, date, text)
  to authenticated;

comment on function public.get_profitability_dashboard(date, date, text) is
  'Returns currency-safe monthly finance metrics without mixing monetary values across currencies.';

commit;
