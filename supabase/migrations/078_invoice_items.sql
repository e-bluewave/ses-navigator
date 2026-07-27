-- SES Navigator
-- Migration: 078_invoice_items
-- Purpose: Store invoice line items and calculation details.

begin;

create table app.invoice_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  invoice_id uuid not null,
  line_no integer not null,
  item_type text not null default 'service' check (item_type in ('service','expense','adjustment','discount','tax_exempt','other')),
  description text not null,
  quantity numeric(12,4) not null default 1,
  unit text,
  unit_price numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 10,
  amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  work_log_id uuid,
  display_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id),
  unique (tenant_id, invoice_id, line_no),
  foreign key (tenant_id, invoice_id) references app.invoices(tenant_id, id) on delete cascade,
  foreign key (tenant_id, work_log_id) references app.work_logs(tenant_id, id) on delete set null,
  check (line_no > 0),
  check (quantity >= 0),
  check (tax_rate between 0 and 100),
  check (tax_amount >= 0)
);

create index invoice_items_invoice_idx on app.invoice_items(tenant_id, invoice_id, display_order, line_no) where deleted_at is null;

select app.attach_updated_at_trigger('app.invoice_items'::regclass);

commit;