-- SES Navigator
-- Migration: 081_files
-- Purpose: Store logical file records backed by private object storage.

begin;

create table app.files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  file_name text not null,
  media_type text,
  storage_bucket text not null default 'private',
  current_version_no integer not null default 0 check (current_version_no >= 0),
  status text not null default 'pending' check (status in ('pending','available','quarantined','deleted')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id)
);

create index files_tenant_status_idx on app.files(tenant_id, status) where deleted_at is null;
select app.attach_updated_at_trigger('app.files'::regclass);

commit;