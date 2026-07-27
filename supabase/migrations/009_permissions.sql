-- SES Navigator
-- Migration: 009_permissions
-- Purpose: Define application permission catalog.

begin;

create table app.permissions (
  id uuid primary key default gen_random_uuid(),
  code citext not null unique,
  resource text not null,
  action text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (resource, action)
);

insert into app.permissions (code, resource, action, description)
values
  ('tenant.read', 'tenant', 'read', 'View tenant settings'),
  ('tenant.manage', 'tenant', 'manage', 'Manage tenant settings'),
  ('organization.manage', 'organization', 'manage', 'Manage organizations'),
  ('user.manage', 'user', 'manage', 'Manage application users'),
  ('role.manage', 'role', 'manage', 'Manage roles and permissions'),
  ('company.read', 'company', 'read', 'View companies'),
  ('company.manage', 'company', 'manage', 'Manage companies'),
  ('engineer.read', 'engineer', 'read', 'View engineers'),
  ('engineer.manage', 'engineer', 'manage', 'Manage engineers'),
  ('project.read', 'project', 'read', 'View projects'),
  ('project.manage', 'project', 'manage', 'Manage projects')
on conflict (code) do nothing;

commit;
