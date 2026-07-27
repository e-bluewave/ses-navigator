-- SES Navigator
-- Migration: 084_comments
begin;
create table app.comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  body text not null,
  visibility text not null default 'tenant' check (visibility in ('private','organization','tenant')),
  parent_comment_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  delete_reason text,
  unique (tenant_id, id),
  foreign key (tenant_id, parent_comment_id) references app.comments(tenant_id, id) on delete set null
);
create index comments_tenant_created_idx on app.comments(tenant_id, created_at desc) where deleted_at is null;
select app.attach_updated_at_trigger('app.comments'::regclass);
commit;