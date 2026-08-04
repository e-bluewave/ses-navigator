-- SES Navigator
-- Migration: 082_file_versions
begin;
create table app.file_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  file_id uuid not null,
  version_no integer not null check (version_no > 0),
  storage_path text not null,
  original_file_name text not null,
  media_type text,
  size_bytes bigint not null check (size_bytes >= 0),
  checksum_sha256 text,
  scan_status text not null default 'pending' check (scan_status in ('pending','clean','infected','failed')),
  extracted_text text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  unique (tenant_id, file_id, version_no),
  unique (tenant_id, storage_path),
  foreign key (tenant_id, file_id) references app.files(tenant_id, id) on delete cascade
);
create index file_versions_file_idx on app.file_versions(tenant_id, file_id, version_no desc);
commit;