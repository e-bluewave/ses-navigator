-- SES Navigator
-- Migration: 080_expense_records
-- Purpose: Store reimbursable and billable expenses related to contracts and work logs.

begin;

create table app.expense_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  contract_id uuid,
  work_log_id uuid,
  engineer_id uuid,
  expense_date date not null,
  expense_type text not null check (expense_type in ('transportation','lodging','communication','equipment','meal','other')),
  description text not null,
  amount numeric(14,2) not null,
  tax_amount numeric(14,2) not null default 0,
  currency char(3) not null default 'JPY',
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','invoiced','reimbursed','cancelled')),
  billable boolean not null default false,
  invoice_id uuid,
  receipt_path text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
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
  foreign key (tenant_id, contract_id) references app.contracts(tenant_id, id) on delete set null,
  foreign key (tenant_id, work_log_id) references app.work_logs(tenant_id, id) on delete set null,
  foreign key (tenant_id, engineer_id) references app.engineers(tenant_id, id) on delete set null,
  foreign key (tenant_id, invoice_id) references app.invoices(tenant_id, id) on delete set null,
  check (amount >= 0 and tax_amount >= 0),
  check (not billable or contract_id is not null)
);

create index expense_records_contract_idx on app.expense_records(tenant_id, contract_id, expense_date desc) where deleted_at is null;
create index expense_records_status_idx on app.expense_records(tenant_id, status, expense_date desc) where deleted_at is null;

select app.attach_updated_at_trigger('app.expense_records'::regclass);

commit;