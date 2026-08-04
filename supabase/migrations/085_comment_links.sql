-- SES Navigator
-- Migration: 085_comment_links
begin;
create table app.comment_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  comment_id uuid not null,
  resource_type text not null,
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, comment_id, resource_type, resource_id),
  foreign key (tenant_id, comment_id) references app.comments(tenant_id, id) on delete cascade
);
create index comment_links_resource_idx on app.comment_links(tenant_id, resource_type, resource_id);
commit;