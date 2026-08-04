-- SES Navigator
-- Migration: 087_tag_links
begin;
create table app.tag_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  tag_id uuid not null,
  resource_type text not null,
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  unique (tenant_id, tag_id, resource_type, resource_id),
  foreign key (tenant_id, tag_id) references app.tags(tenant_id, id) on delete cascade
);
create index tag_links_resource_idx on app.tag_links(tenant_id, resource_type, resource_id);
commit;