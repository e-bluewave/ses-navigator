-- SES Navigator
-- Migration: 077_invoices
-- Purpose: Define sales and purchase invoices linked to contracts and billing accounts.

begin;

create table app.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  invoice_no varchar(40) not null,
  invoice_type text not null check (invoice_type in ('sales','purchase')),
  contract_id uuid,
  billing_account_id uuid not null,
  billing_company_id uuid not null,
  billing_period_start date,
  billing_period_end date,
  issue_date date not null,
  due_date date not null,
  status text not null default 'draft' check (status in ('draft','issued','sent','partially_paid','paid','overdue','cancelled','void')),
  currency char(3) not null default 'JPY',
  subtotal numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  document_path text,
  sent_at timestamptz,
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
  unique (tenant_id, invoice_no),
  foreign key (tenant_id, contract_id) references app.contracts(tenant_id, id) on delete set null,
  foreign key (tenant_id, billing_account_id) references app.billing_accounts(tenant_id, id) on delete restrict,
  foreign key (tenant_id, billing_company_id) references app.companies(tenant_id, id) on delete restrict,
  check (billing_period_end is null or billing_period_start is null or billing_period_end >= billing_period_start),
  check (due_date >= issue_date),
  check (subtotal >= 0 and tax_amount >= 0 and total_amount >= 0 and paid_amount >= 0),
  check (paid_amount <= total_amount)
);

create index invoices_status_due_idx on app.invoices(tenant_id, status, due_date) where deleted_at is null;
create index invoices_company_idx on app.invoices(tenant_id, billing_company_id, issue_date desc) where deleted_at is null;
create index invoices_contract_idx on app.invoices(tenant_id, contract_id) where deleted_at is null;

select app.attach_updated_at_trigger('app.invoices'::regclass);

commit;