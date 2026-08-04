-- SES Navigator
-- Migration: 076_billing_accounts
-- Purpose: Store tenant-scoped billing and payment destination settings for companies.

begin;

create table app.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  company_id uuid not null,
  account_type text not null check (account_type in ('receivable','payable','both')),
  account_name text not null,
  closing_day integer,
  payment_month_offset integer not null default 1,
  payment_day integer,
  invoice_delivery_method text not null default 'email' check (invoice_delivery_method in ('email','postal','portal','edi','other')),
  invoice_email citext,
  bank_name text,
  bank_branch_name text,
  bank_account_type text check (bank_account_type in ('ordinary','checking','savings','other')),
  bank_account_number text,
  bank_account_holder text,
  tax_registration_number text,
  is_default boolean not null default false,
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
  foreign key (tenant_id, company_id) references app.companies(tenant_id, id) on delete cascade,
  check (closing_day is null or closing_day between 1 and 31),
  check (payment_day is null or payment_day between 1 and 31),
  check (payment_month_offset between 0 and 12)
);

create index billing_accounts_company_idx on app.billing_accounts(tenant_id, company_id, account_type) where deleted_at is null;
create unique index billing_accounts_default_uidx on app.billing_accounts(tenant_id, company_id, account_type) where is_default and deleted_at is null;

select app.attach_updated_at_trigger('app.billing_accounts'::regclass);

commit;