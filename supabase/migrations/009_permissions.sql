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
  ('organization.read', 'organization', 'read', 'View organizations'),
  ('organization.manage', 'organization', 'manage', 'Manage organizations'),
  ('user.read', 'user', 'read', 'View application users'),
  ('user.manage', 'user', 'manage', 'Manage application users'),
  ('role.read', 'role', 'read', 'View roles and permissions'),
  ('role.manage', 'role', 'manage', 'Manage roles and permissions'),
  ('share.read', 'share', 'read', 'View explicit record shares'),
  ('share.manage', 'share', 'manage', 'Manage explicit record shares'),
  ('company.read', 'company', 'read', 'View companies'),
  ('company.manage', 'company', 'manage', 'Manage companies'),
  ('company.risk.read', 'company.risk', 'read', 'View company risk records'),
  ('company.risk.manage', 'company.risk', 'manage', 'Manage company risk records'),
  ('engineer.read', 'engineer', 'read', 'View engineers'),
  ('engineer.manage', 'engineer', 'manage', 'Manage engineers'),
  ('engineer.private.read', 'engineer.private', 'read', 'View private engineer details'),
  ('engineer.private.manage', 'engineer.private', 'manage', 'Manage private engineer details'),
  ('project.read', 'project', 'read', 'View projects'),
  ('project.manage', 'project', 'manage', 'Manage projects'),
  ('proposal.read', 'proposal', 'read', 'View proposals'),
  ('proposal.manage', 'proposal', 'manage', 'Manage proposals'),
  ('proposal.send', 'proposal', 'send', 'Send approved proposals'),
  ('approval.read', 'approval', 'read', 'View approval requests'),
  ('approval.manage', 'approval', 'manage', 'Create and manage approval requests'),
  ('approval.decide', 'approval', 'decide', 'Approve or reject assigned requests'),
  ('message.read', 'message', 'read', 'View outbound messages and templates'),
  ('message.manage', 'message', 'manage', 'Manage outbound messages and templates'),
  ('message.send', 'message', 'send', 'Send outbound messages'),
  ('interview.read', 'interview', 'read', 'View interviews'),
  ('interview.manage', 'interview', 'manage', 'Manage interviews'),
  ('contract.read', 'contract', 'read', 'View contracts and work logs'),
  ('contract.manage', 'contract', 'manage', 'Manage contracts and work logs'),
  ('contract.approve', 'contract', 'approve', 'Approve or finalize contracts'),
  ('finance.read', 'finance', 'read', 'View billing, invoices, payments, and expenses'),
  ('finance.manage', 'finance', 'manage', 'Manage billing, invoices, payments, and expenses'),
  ('file.read', 'file', 'read', 'View files linked to accessible records'),
  ('file.manage', 'file', 'manage', 'Manage files linked to accessible records'),
  ('comment.read', 'comment', 'read', 'View comments linked to accessible records'),
  ('comment.manage', 'comment', 'manage', 'Create and edit comments'),
  ('tag.read', 'tag', 'read', 'View tags'),
  ('tag.manage', 'tag', 'manage', 'Manage tags'),
  ('notification.read', 'notification', 'read', 'View own notifications'),
  ('notification.manage', 'notification', 'manage', 'Create and manage notifications'),
  ('task.read', 'task', 'read', 'View assigned or shared tasks'),
  ('task.manage', 'task', 'manage', 'Create and manage tasks'),
  ('search.read', 'search', 'read', 'Use saved searches'),
  ('search.manage', 'search', 'manage', 'Manage saved searches'),
  ('ai.read', 'ai', 'read', 'View authorized AI execution records'),
  ('ai.execute', 'ai', 'execute', 'Request AI executions'),
  ('ai.review', 'ai', 'review', 'Review AI execution outputs'),
  ('job.read', 'job', 'read', 'View background job status'),
  ('job.manage', 'job', 'manage', 'Manage background jobs'),
  ('webhook.read', 'webhook', 'read', 'View webhook configuration and deliveries'),
  ('webhook.manage', 'webhook', 'manage', 'Manage webhook configuration'),
  ('audit.read', 'audit', 'read', 'View tenant audit logs')
on conflict (code) do nothing;

commit;
