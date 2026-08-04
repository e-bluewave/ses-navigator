-- SES Navigator
-- Migration: 083_file_links
begin;
create table app.file_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  file_id uuid not null,
  resource_type text not null,
  resource_id uuid not null,
  link_type text not null default 'attachment',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  unique (tenant_id, file_id, resource_type, resource_id, link_type),
  foreign key (tenant_id, file_id) references app.files(tenant_id, id) on delete cascade
);
create index file_links_resource_idx on app.file_links(tenant_id, resource_type, resource_id);
commit;