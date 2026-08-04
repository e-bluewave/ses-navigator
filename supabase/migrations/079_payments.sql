-- SES Navigator
-- Migration: 079_payments
-- Purpose: Track incoming and outgoing payments applied to invoices.

begin;

create table app.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  invoice_id uuid not null,
  payment_type text not null check (payment_type in ('receipt','payment','refund','offset','other')),
  payment_date date not null,
  amount numeric(14,2) not null,
  currency char(3) not null default 'JPY',
  payment_method text check (payment_method in ('bank_transfer','cash','credit_card','direct_debit','offset','other')),
  reference_no text,
  bank_fee_amount numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id),
  foreign key (tenant_id, invoice_id) references app.invoices(tenant_id, id) on delete cascade,
  check (amount > 0),
  check (bank_fee_amount >= 0)
);

create index payments_invoice_idx on app.payments(tenant_id, invoice_id, payment_date desc) where deleted_at is null;
create index payments_date_idx on app.payments(tenant_id, payment_date desc) where deleted_at is null;

select app.attach_updated_at_trigger('app.payments'::regclass);

commit;