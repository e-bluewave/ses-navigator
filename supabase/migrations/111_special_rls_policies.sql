-- SES Navigator
-- Migration: 111_special_rls_policies
-- Purpose: Protect global and audit tables excluded from the default tenant RLS migrations.

begin;

-- Global application tables do not have tenant_id, so migrations 109 and 110
-- cannot configure them through the tenant-table loops.
alter table app.tenants enable row level security;
alter table app.tenants force row level security;

alter table app.permissions enable row level security;
alter table app.permissions force row level security;

alter table app.system_admins enable row level security;
alter table app.system_admins force row level security;

drop policy if exists tenant_select on app.tenants;
create policy tenant_select
  on app.tenants
  for select
  to authenticated
  using (
    app.is_system_admin()
    or (
      id = app.current_tenant_id()
      and (
        app.has_permission('tenant.read')
        or app.has_permission('tenant.manage')
      )
    )
  );

drop policy if exists tenant_insert on app.tenants;
create policy tenant_insert
  on app.tenants
  for insert
  to authenticated
  with check (app.is_system_admin());

drop policy if exists tenant_update on app.tenants;
create policy tenant_update
  on app.tenants
  for update
  to authenticated
  using (
    app.is_system_admin()
    or (
      id = app.current_tenant_id()
      and app.has_permission('tenant.manage')
    )
  )
  with check (
    app.is_system_admin()
    or (
      id = app.current_tenant_id()
      and app.has_permission('tenant.manage')
    )
  );

-- The permission catalog is readable by signed-in users. Catalog mutations are
-- restricted to platform administrators and physical deletion is not exposed.
drop policy if exists permission_select on app.permissions;
create policy permission_select
  on app.permissions
  for select
  to authenticated
  using (true);

drop policy if exists permission_insert on app.permissions;
create policy permission_insert
  on app.permissions
  for insert
  to authenticated
  with check (app.is_system_admin());

drop policy if exists permission_update on app.permissions;
create policy permission_update
  on app.permissions
  for update
  to authenticated
  using (app.is_system_admin())
  with check (app.is_system_admin());

-- Shared skills and aliases use a null tenant_id. The default tenant policy
-- from migration 110 must be widened for reads or global catalog rows would be
-- invisible to every tenant user.
drop policy if exists tenant_select on app.skills;
create policy tenant_select
  on app.skills
  for select
  to authenticated
  using (
    app.is_system_admin()
    or (
      app.current_tenant_id() is not null
      and (
        tenant_id is null
        or tenant_id = app.current_tenant_id()
      )
    )
  );

drop policy if exists tenant_select on app.skill_aliases;
create policy tenant_select
  on app.skill_aliases
  for select
  to authenticated
  using (
    app.is_system_admin()
    or (
      app.current_tenant_id() is not null
      and (
        tenant_id is null
        or tenant_id = app.current_tenant_id()
      )
    )
  );

-- Administrators may inspect and maintain the administrator registry. A user
-- may inspect only their own registry row. Revocation uses the existing
-- is_active and revoked_at fields instead of physical deletion.
drop policy if exists system_admin_select on app.system_admins;
create policy system_admin_select
  on app.system_admins
  for select
  to authenticated
  using (
    app.is_system_admin()
    or user_id = auth.uid()
  );

drop policy if exists system_admin_insert on app.system_admins;
create policy system_admin_insert
  on app.system_admins
  for insert
  to authenticated
  with check (app.is_system_admin());

drop policy if exists system_admin_update on app.system_admins;
create policy system_admin_update
  on app.system_admins
  for update
  to authenticated
  using (app.is_system_admin())
  with check (true);

-- Audit tables live outside the app schema and therefore also require explicit
-- RLS configuration. They remain append-only for authenticated clients.
alter table audit.task_status_histories enable row level security;
alter table audit.task_status_histories force row level security;

alter table audit.audit_logs enable row level security;
alter table audit.audit_logs force row level security;

drop policy if exists task_status_history_select on audit.task_status_histories;
create policy task_status_history_select
  on audit.task_status_histories
  for select
  to authenticated
  using (
    app.is_system_admin()
    or tenant_id = app.current_tenant_id()
  );

drop policy if exists audit_log_select on audit.audit_logs;
create policy audit_log_select
  on audit.audit_logs
  for select
  to authenticated
  using (
    app.is_system_admin()
    or (
      tenant_id = app.current_tenant_id()
      and app.has_permission('tenant.manage')
    )
  );

revoke update, delete, truncate
  on audit.task_status_histories
  from public, anon, authenticated;

commit;
