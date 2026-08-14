-- SES Navigator
-- Migration: 144_invoice_payment_allocation_rpc
-- Purpose: Register and reverse invoice payments while recalculating invoice
--          paid amount, settlement status, lifecycle history, and audit state.

begin;

create or replace function private.recalculate_invoice_payment_state(
  p_tenant_id uuid,
  p_invoice_id uuid,
  p_reason text,
  p_payment_id uuid
)
returns app.invoices
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target app.invoices%rowtype;
  saved app.invoices%rowtype;
  calculated_paid numeric(14,2);
  calculated_status text;
begin
  select i.* into target from app.invoices i
  where i.id = p_invoice_id and i.tenant_id = p_tenant_id
    and i.deleted_at is null
  for update;
  if not found then raise exception 'invoice not found' using errcode = 'P0002'; end if;

  select coalesce(sum(case when p.payment_type = 'refund' then -p.amount else p.amount end), 0)
  into calculated_paid
  from app.payments p
  where p.tenant_id = p_tenant_id and p.invoice_id = p_invoice_id
    and p.deleted_at is null;

  if calculated_paid < 0 or calculated_paid > target.total_amount then
    raise exception 'payment allocation exceeds invoice balance' using errcode = '22023';
  end if;

  calculated_status := case
    when calculated_paid >= target.total_amount and target.total_amount > 0 then 'paid'
    when calculated_paid > 0 then 'partially_paid'
    when target.due_date < current_date then 'overdue'
    when target.sent_at is not null then 'sent'
    else 'issued'
  end;

  update app.invoices set
    paid_amount = calculated_paid,
    status = calculated_status,
    updated_by = auth.uid()
  where id = target.id returning * into saved;

  if saved.status <> target.status then
    insert into app.invoice_status_histories(
      tenant_id, invoice_id, from_status, to_status, change_reason,
      changed_by, metadata
    ) values (
      p_tenant_id, saved.id, target.status, saved.status, p_reason,
      auth.uid(), jsonb_build_object('payment_id', p_payment_id)
    );
  end if;
  return saved;
end
$$;

create or replace function public.register_invoice_payment(
  p_invoice_id uuid,
  p_row_version bigint,
  p_payment jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  target app.invoices%rowtype;
  saved app.invoices%rowtype;
  payment app.payments%rowtype;
  v_payment_type text;
  v_payment_date date;
  v_amount numeric(14,2);
  v_currency text;
  v_payment_method text;
  v_bank_fee numeric(14,2);
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('finance.manage')
     or p_invoice_id is null or p_row_version is null or p_row_version < 1
     or p_payment is null or jsonb_typeof(p_payment) <> 'object'
  then raise exception 'invalid payment registration request' using errcode = '22023'; end if;

  begin
    v_payment_type := btrim(p_payment->>'payment_type');
    v_payment_date := (p_payment->>'payment_date')::date;
    v_amount := (p_payment->>'amount')::numeric;
    v_currency := upper(btrim(p_payment->>'currency'));
    v_payment_method := nullif(btrim(p_payment->>'payment_method'), '');
    v_bank_fee := coalesce(nullif(p_payment->>'bank_fee_amount', '')::numeric, 0);
  exception when others then
    raise exception 'invalid payment fields' using errcode = '22023';
  end;

  if v_payment_type is null
     or v_payment_type not in ('receipt','payment','refund','offset','other')
     or v_payment_date is null or v_amount is null or v_amount <= 0
     or v_currency !~ '^[A-Z]{3}$'
     or (v_payment_method is not null and v_payment_method not in (
       'bank_transfer','cash','credit_card','direct_debit','offset','other'
     ))
     or v_bank_fee < 0
  then raise exception 'invalid payment fields' using errcode = '22023'; end if;

  select i.* into target from app.invoices i
  where i.id = p_invoice_id and i.tenant_id = tenant and i.deleted_at is null
    and app.can_access_invoice(i.id, 'finance.manage', 'edit')
  for update;
  if not found or target.row_version <> p_row_version
     or target.status not in ('issued','sent','partially_paid','paid','overdue')
     or target.currency <> v_currency
     or (target.invoice_type = 'sales' and v_payment_type = 'payment')
     or (target.invoice_type = 'purchase' and v_payment_type = 'receipt')
  then return null; end if;

  insert into app.payments(
    tenant_id, invoice_id, payment_type, payment_date, amount, currency,
    payment_method, bank_fee_amount, created_by, updated_by
  ) values (
    tenant, target.id, v_payment_type, v_payment_date, v_amount, v_currency,
    v_payment_method, v_bank_fee, auth.uid(), auth.uid()
  ) returning * into payment;

  saved := private.recalculate_invoice_payment_state(
    tenant, target.id, 'Payment applied', payment.id
  );

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'payment.created', 'payment', payment.id,
    nullif(p_request_id, ''), null,
    jsonb_build_object('invoice_id', saved.id, 'payment_type', payment.payment_type,
      'amount', payment.amount, 'currency', payment.currency),
    jsonb_build_object('invoice_status', saved.status,
      'invoice_paid_amount', saved.paid_amount)
  );
  return jsonb_build_object('invoice_id', saved.id, 'payment_id', payment.id);
end
$$;

create or replace function public.reverse_invoice_payment(
  p_invoice_id uuid,
  p_payment_id uuid,
  p_row_version bigint,
  p_reason text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  tenant uuid := app.current_tenant_id();
  target app.invoices%rowtype;
  payment app.payments%rowtype;
  saved app.invoices%rowtype;
  normalized_reason text := nullif(btrim(p_reason), '');
begin
  if auth.uid() is null or tenant is null
     or not app.has_permission('finance.manage')
     or p_invoice_id is null or p_payment_id is null
     or p_row_version is null or p_row_version < 1
     or normalized_reason is null or length(normalized_reason) > 1000
  then raise exception 'invalid payment reversal request' using errcode = '22023'; end if;

  select i.* into target from app.invoices i
  where i.id = p_invoice_id and i.tenant_id = tenant and i.deleted_at is null
    and app.can_access_invoice(i.id, 'finance.manage', 'edit')
  for update;
  if not found or target.row_version <> p_row_version
     or target.status in ('draft','cancelled','void')
  then return null; end if;

  select p.* into payment from app.payments p
  where p.id = p_payment_id and p.tenant_id = tenant
    and p.invoice_id = target.id and p.deleted_at is null
  for update;
  if not found then return null; end if;

  update app.payments set
    deleted_at = now(), deleted_by = auth.uid(), delete_reason = normalized_reason,
    updated_by = auth.uid()
  where id = payment.id;

  saved := private.recalculate_invoice_payment_state(
    tenant, target.id, 'Payment reversed: ' || normalized_reason, payment.id
  );

  insert into audit.audit_logs(
    tenant_id, actor_user_id, actor_type, action, resource_type, resource_id,
    request_id, before_data, after_data, metadata
  ) values (
    tenant, auth.uid(), 'user', 'payment.reversed', 'payment', payment.id,
    nullif(p_request_id, ''),
    jsonb_build_object('invoice_id', target.id, 'payment_type', payment.payment_type,
      'amount', payment.amount, 'currency', payment.currency),
    jsonb_build_object('deleted', true, 'reason', normalized_reason),
    jsonb_build_object('invoice_status', saved.status,
      'invoice_paid_amount', saved.paid_amount)
  );
  return jsonb_build_object('invoice_id', saved.id, 'payment_id', payment.id);
end
$$;

revoke all on function private.recalculate_invoice_payment_state(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.register_invoice_payment(uuid, bigint, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.reverse_invoice_payment(uuid, uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.register_invoice_payment(uuid, bigint, jsonb, text)
  to authenticated;
grant execute on function public.reverse_invoice_payment(uuid, uuid, bigint, text, text)
  to authenticated;

comment on function public.register_invoice_payment(uuid, bigint, jsonb, text) is
  'Registers one authorized payment and atomically recalculates invoice paid amount, settlement status, history, and audit state.';
comment on function public.reverse_invoice_payment(uuid, uuid, bigint, text, text) is
  'Soft-reverses one authorized payment with a mandatory reason and recalculates the invoice settlement state.';

commit;
