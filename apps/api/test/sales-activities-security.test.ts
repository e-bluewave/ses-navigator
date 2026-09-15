import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const coreMigrationUrl = new URL(
  '../../../supabase/migrations/161_sales_activities.sql',
  import.meta.url,
);
const readMigrationUrl = new URL(
  '../../../supabase/migrations/162_sales_activity_read_rpc.sql',
  import.meta.url,
);
const createMigrationUrl = new URL(
  '../../../supabase/migrations/163_sales_activity_create_follow_up_rpc.sql',
  import.meta.url,
);

describe('Sales activity database boundary', () => {
  it('keeps the base table tenant-scoped, RLS-protected, and closed to direct authenticated access', async () => {
    const sql = await readFile(coreMigrationUrl, 'utf8');

    expect(sql).toContain('create table app.sales_activities');
    expect(sql).toContain(
      'tenant_id uuid not null references app.tenants(id) on delete cascade',
    );
    expect(sql).toContain('alter table app.sales_activities enable row level security');
    expect(sql).toContain('alter table app.sales_activities force row level security');
    expect(sql).toContain(
      "app.can_access_sales_activity(id, 'company.read', 'view')",
    );
    expect(sql).toContain(
      "app.can_access_company(company_id, 'company.manage', 'edit')",
    );
    expect(sql).toContain(
      'revoke all on table app.sales_activities from public, anon, authenticated;',
    );
  });

  it('adds sales_activity to generic linked-resource authorization', async () => {
    const sql = await readFile(coreMigrationUrl, 'utf8');

    expect(sql).toContain('create or replace function app.can_access_sales_activity');
    expect(sql).toContain("when 'sales_activity' then app.can_access_sales_activity(");
    expect(sql).toContain(
      'grant execute on function app.can_access_resource(text, uuid, text, text)',
    );
  });

  it('lists only the requested current-tenant company and separately protects related records', async () => {
    const sql = await readFile(readMigrationUrl, 'utf8');

    expect(sql).toContain('tenant uuid := app.current_tenant_id()');
    expect(sql).toContain(
      "app.can_access_company(p_company_id, 'company.read', 'view')",
    );
    expect(sql).toContain('activity.tenant_id = tenant');
    expect(sql).toContain('activity.company_id = p_company_id');
    expect(sql).toContain('activity.deleted_at is null');
    expect(sql).toContain(
      "app.can_access_company_contact(\n                item.company_contact_id, 'company.read', 'view'",
    );
    expect(sql).toContain(
      "app.can_access_project(item.project_id, 'project.read', 'view')",
    );
    expect(sql).toContain(
      "app.can_access_engineer(item.engineer_id, 'engineer.read', 'view')",
    );
    expect(sql).toContain(
      "app.can_access_task(task.id, 'task.read', 'view')",
    );
  });

  it('creates activity and follow-up atomically with tenant and record access checks', async () => {
    const sql = await readFile(createMigrationUrl, 'utf8');

    expect(sql).toContain('tenant uuid := app.current_tenant_id()');
    expect(sql).toContain('actor uuid := auth.uid()');
    expect(sql).toContain(
      "app.can_access_company(p_company_id, 'company.manage', 'edit')",
    );
    expect(sql).toContain('contact.company_id = p_company_id');
    expect(sql).toContain('project.tenant_id = tenant');
    expect(sql).toContain('engineer.tenant_id = tenant');
    expect(sql).toContain("app.has_permission('task.manage')");
    expect(sql).toContain('insert into app.sales_activities(');
    expect(sql).toContain('insert into app.tasks(');
    expect(sql).toContain('insert into app.task_assignments(');
    expect(sql).toContain("actor, 'owner', actor");
    expect(sql).toContain('insert into app.task_links(');
    expect(sql).toContain(
      "(tenant, task.id, 'sales_activity', activity.id, 'generated_from', actor)",
    );
    expect(sql).toContain(
      "(tenant, task.id, 'company', p_company_id, 'related', actor)",
    );
  });

  it('uses request hashing and idempotency to prevent duplicate activity/task creation', async () => {
    const sql = await readFile(createMigrationUrl, 'utf8');

    expect(sql).toContain('public.digest');
    expect(sql).toContain("'sales_activity.create'");
    expect(sql).toContain('insert into app.idempotency_records(');
    expect(sql).toContain('on conflict (tenant_id, actor_type, actor_id, operation_name, idempotency_key)');
    expect(sql).toContain('for update;');
    expect(sql).toContain('idempotency.request_hash is distinct from request_hash');
    expect(sql).toContain('if idempotency.completed_at is not null then');
    expect(sql).toContain('return idempotency.response_body;');
    expect(sql).toContain('response_status = 201');
  });

  it('exposes both RPCs only through explicit authenticated execution grants', async () => {
    const readSql = await readFile(readMigrationUrl, 'utf8');
    const createSql = await readFile(createMigrationUrl, 'utf8');

    expect(readSql).toContain(
      'from public, anon, authenticated;',
    );
    expect(readSql).toContain('to authenticated;');
    expect(createSql).toContain(
      'from public, anon, authenticated;',
    );
    expect(createSql).toContain('to authenticated;');
  });
});
