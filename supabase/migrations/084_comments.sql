-- SES Navigator
-- Migration: 084_comments
-- Purpose: Define comments with private, organization, and tenant visibility.

begin;
create table app.comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  body text not null,
  visibility text not null default 'tenant' check (visibility in ('private','organization','tenant')),
  organization_id uuid,
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
  foreign key (tenant_id, parent_comment_id) references app.comments(tenant_id, id) on delete set null,
  foreign key (tenant_id, organization_id)
    references app.organizations(tenant_id, id)
    on delete set null (organization_id),
  check (
    (visibility = 'organization' and organization_id is not null)
    or (visibility <> 'organization' and organization_id is null)
  )
);
create index comments_tenant_created_idx on app.comments(tenant_id, created_at desc) where deleted_at is null;
create index comments_organization_idx
  on app.comments(tenant_id, organization_id, created_at desc)
  where deleted_at is null and visibility = 'organization';
select app.attach_updated_at_trigger('app.comments'::regclass);
commit;
