-- SES Navigator
-- Migration: 015_rls_helpers
-- Purpose: Provide tenant, organization, permission, and sharing helpers for Row Level Security.

begin;

create or replace function app.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select tm.tenant_id
  from app.tenant_memberships tm
  join app.user_profiles up on up.user_id = tm.user_id
  join app.tenants t on t.id = tm.tenant_id
  where tm.user_id = auth.uid()
    and up.status = 'active'
    and tm.membership_status = 'active'
    and t.status in ('trial', 'active')
    and tm.is_default
    and (tm.joined_at is null or tm.joined_at <= now())
    and (tm.left_at is null or tm.left_at > now())
  order by tm.created_at, tm.id
  limit 1;
$$;

create or replace function app.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from app.system_admins sa
    where sa.user_id = auth.uid()
      and sa.is_active
      and sa.revoked_at is null
  );
$$;

create or replace function app.is_tenant_member(required_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.is_system_admin()
    or exists (
      select 1
      from app.tenant_memberships tm
      join app.user_profiles up on up.user_id = tm.user_id
      join app.tenants t on t.id = tm.tenant_id
      where tm.user_id = auth.uid()
        and tm.tenant_id = required_tenant_id
        and up.status = 'active'
        and tm.membership_status = 'active'
        and t.status in ('trial', 'active')
        and (tm.joined_at is null or tm.joined_at <= now())
        and (tm.left_at is null or tm.left_at > now())
    );
$$;

create or replace function app.organization_scope_contains(
  required_tenant_id uuid,
  scope_organization_id uuid,
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with recursive organization_ancestors as (
    select o.id, o.parent_id
    from app.organizations o
    where o.tenant_id = required_tenant_id
      and o.id = target_organization_id
      and o.is_active

    union

    select parent.id, parent.parent_id
    from app.organizations parent
    join organization_ancestors child on child.parent_id = parent.id
    where parent.tenant_id = required_tenant_id
      and parent.is_active
  )
  select scope_organization_id is not null
    and target_organization_id is not null
    and exists (
      select 1
      from organization_ancestors
      where id = scope_organization_id
    );
$$;

create or replace function app.belongs_to_organization(
  required_tenant_id uuid,
  required_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.is_system_admin()
    or (
      app.is_tenant_member(required_tenant_id)
      and exists (
        select 1
        from app.organization_memberships om
        where om.user_id = auth.uid()
          and om.tenant_id = required_tenant_id
          and om.membership_status = 'active'
          and om.valid_from <= current_date
          and (om.valid_to is null or om.valid_to >= current_date)
          and app.organization_scope_contains(
            required_tenant_id,
            required_organization_id,
            om.organization_id
          )
      )
    );
$$;

create or replace function app.belongs_to_organization(required_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.belongs_to_organization(
    app.current_tenant_id(),
    required_organization_id
  );
$$;

create or replace function app.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.is_system_admin()
    or exists (
      select 1
      from app.user_profiles up
      join app.tenant_memberships tm
        on tm.user_id = up.user_id
       and tm.tenant_id = app.current_tenant_id()
      join app.user_roles ur
        on ur.user_id = up.user_id
       and ur.tenant_id = tm.tenant_id
      join app.roles r
        on r.id = ur.role_id
       and r.tenant_id = ur.tenant_id
      join app.role_permissions rp
        on rp.role_id = r.id
       and rp.tenant_id = r.tenant_id
      join app.permissions p on p.id = rp.permission_id
      where up.user_id = auth.uid()
        and up.status = 'active'
        and tm.membership_status = 'active'
        and (tm.joined_at is null or tm.joined_at <= now())
        and (tm.left_at is null or tm.left_at > now())
        and ur.valid_from <= current_date
        and (ur.valid_to is null or ur.valid_to >= current_date)
        and ur.revoked_at is null
        and p.code = required_permission
    );
$$;

create or replace function app.has_permission(
  required_permission text,
  required_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.is_system_admin()
    or exists (
      select 1
      from app.user_profiles up
      join app.tenant_memberships tm
        on tm.user_id = up.user_id
       and tm.tenant_id = app.current_tenant_id()
      join app.user_roles ur
        on ur.user_id = up.user_id
       and ur.tenant_id = tm.tenant_id
      join app.roles r
        on r.id = ur.role_id
       and r.tenant_id = ur.tenant_id
      join app.role_permissions rp
        on rp.role_id = r.id
       and rp.tenant_id = r.tenant_id
      join app.permissions p on p.id = rp.permission_id
      where up.user_id = auth.uid()
        and up.status = 'active'
        and tm.membership_status = 'active'
        and (tm.joined_at is null or tm.joined_at <= now())
        and (tm.left_at is null or tm.left_at > now())
        and ur.valid_from <= current_date
        and (ur.valid_to is null or ur.valid_to >= current_date)
        and ur.revoked_at is null
        and p.code = required_permission
        and (
          ur.organization_id is null
          or (
            required_organization_id is not null
            and app.organization_scope_contains(
              ur.tenant_id,
              ur.organization_id,
              required_organization_id
            )
          )
        )
    );
$$;

create or replace function app.has_record_share(
  required_resource_type text,
  required_resource_id uuid,
  required_permission_level text default 'view'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.is_system_admin()
    or exists (
      select 1
      from app.record_shares rs
      where rs.tenant_id = app.current_tenant_id()
        and rs.resource_type = required_resource_type
        and rs.resource_id = required_resource_id
        and rs.revoked_at is null
        and (rs.expires_at is null or rs.expires_at > now())
        and case rs.permission_level
          when 'edit' then 3
          when 'comment' then 2
          else 1
        end >= case required_permission_level
          when 'edit' then 3
          when 'comment' then 2
          else 1
        end
        and (
          rs.shared_with_user_id = auth.uid()
          or (
            rs.shared_with_organization_id is not null
            and app.belongs_to_organization(
              rs.tenant_id,
              rs.shared_with_organization_id
            )
          )
        )
    );
$$;

create or replace function app.can_access_owned_record(
  required_tenant_id uuid,
  required_resource_type text,
  required_resource_id uuid,
  owner_user_id uuid,
  owner_organization_id uuid,
  required_permission text,
  required_share_level text default 'view'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.is_system_admin()
    or (
      required_tenant_id = app.current_tenant_id()
      and app.is_tenant_member(required_tenant_id)
      and (
        app.has_permission(required_permission, owner_organization_id)
        or (
          owner_user_id = auth.uid()
          and app.has_permission(required_permission)
        )
        or (
          app.has_permission(required_permission)
          and app.has_record_share(
            required_resource_type,
            required_resource_id,
            required_share_level
          )
        )
      )
    );
$$;

revoke all on function app.current_tenant_id() from public;
revoke all on function app.is_system_admin() from public;
revoke all on function app.is_tenant_member(uuid) from public;
revoke all on function app.organization_scope_contains(uuid, uuid, uuid) from public;
revoke all on function app.belongs_to_organization(uuid, uuid) from public;
revoke all on function app.belongs_to_organization(uuid) from public;
revoke all on function app.has_permission(text) from public;
revoke all on function app.has_permission(text, uuid) from public;
revoke all on function app.has_record_share(text, uuid, text) from public;
revoke all on function app.can_access_owned_record(uuid, text, uuid, uuid, uuid, text, text) from public;

grant execute on function app.current_tenant_id() to authenticated;
grant execute on function app.is_system_admin() to authenticated;
grant execute on function app.is_tenant_member(uuid) to authenticated;
grant execute on function app.organization_scope_contains(uuid, uuid, uuid) to authenticated;
grant execute on function app.belongs_to_organization(uuid, uuid) to authenticated;
grant execute on function app.belongs_to_organization(uuid) to authenticated;
grant execute on function app.has_permission(text) to authenticated;
grant execute on function app.has_permission(text, uuid) to authenticated;
grant execute on function app.has_record_share(text, uuid, text) to authenticated;
grant execute on function app.can_access_owned_record(uuid, text, uuid, uuid, uuid, text, text) to authenticated;

commit;
