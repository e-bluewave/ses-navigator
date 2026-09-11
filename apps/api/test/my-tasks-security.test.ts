import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const myTasksMigrationUrl = new URL(
  '../../../supabase/migrations/160_my_tasks_rpc.sql',
  import.meta.url,
);
const interviewTaskMigrationUrl = new URL(
  '../../../supabase/migrations/154_ai_interview_summary_task_rpc.sql',
  import.meta.url,
);

describe('My Tasks database boundary', () => {
  it('limits reads to the current tenant and direct user assignment', async () => {
    const sql = await readFile(myTasksMigrationUrl, 'utf8');
    const listFunction = between(
      sql,
      'create or replace function public.list_my_tasks',
      'create or replace function public.update_my_task',
    );

    expect(listFunction).toContain('tenant uuid := app.current_tenant_id()');
    expect(listFunction).toContain('actor uuid := auth.uid()');
    expect(listFunction).toContain("app.has_permission('task.read')");
    expect(listFunction).toContain('task.tenant_id = tenant');
    expect(listFunction).toContain('assignment.assignee_user_id = actor');
    expect(listFunction).toContain(
      "app.can_access_task(task.id, 'task.read', 'view')",
    );
  });

  it('classifies incomplete tasks by due date without mixing completed tasks', async () => {
    const sql = await readFile(myTasksMigrationUrl, 'utf8');
    const listFunction = between(
      sql,
      'create or replace function public.list_my_tasks',
      'create or replace function public.update_my_task',
    );

    expect(listFunction).toContain(
      "when 'incomplete' then task.status not in ('completed', 'cancelled')",
    );
    expect(listFunction).toContain(
      "when 'completed' then task.status = 'completed'",
    );
    expect(listFunction).toContain(
      "when 'overdue' then task.status not in ('completed', 'cancelled') and task.due_at < today_start",
    );
    expect(listFunction).toContain(
      "when 'today' then task.status not in ('completed', 'cancelled') and task.due_at >= today_start and task.due_at < tomorrow_start",
    );
    expect(listFunction).toContain(
      "when 'upcoming' then task.status not in ('completed', 'cancelled') and task.due_at >= tomorrow_start",
    );
  });

  it('updates only a directly assigned task with optimistic locking and history', async () => {
    const sql = await readFile(myTasksMigrationUrl, 'utf8');
    const updateFunction = sql.slice(
      sql.indexOf('create or replace function public.update_my_task'),
    );

    expect(updateFunction).toContain("app.has_permission('task.manage')");
    expect(updateFunction).toContain('task.tenant_id = tenant');
    expect(updateFunction).toContain('task.row_version = p_row_version');
    expect(updateFunction).toContain('assignment.assignee_user_id = actor');
    expect(updateFunction).toContain(
      "app.can_access_task(task.id, 'task.manage', 'edit')",
    );
    expect(updateFunction).toContain('insert into audit.task_status_histories');
    expect(updateFunction).toContain("when next_status = 'completed'");
  });

  it('exposes both RPCs only to authenticated users', async () => {
    const sql = await readFile(myTasksMigrationUrl, 'utf8');

    expect(sql).toContain('from public, anon, authenticated, service_role;');
    expect(sql).toContain(
      'grant execute on function public.list_my_tasks(text, text, integer) to authenticated;',
    );
    expect(sql).toContain(
      'grant execute on function public.update_my_task(uuid, bigint, text, timestamptz, boolean, text) to authenticated;',
    );
  });

  it('keeps AI interview tasks on the same direct assignment and link path', async () => {
    const sql = await readFile(interviewTaskMigrationUrl, 'utf8');

    expect(sql).toContain('insert into app.tasks(');
    expect(sql).toContain('insert into app.task_assignments(');
    expect(sql).toContain("auth.uid(), 'owner', auth.uid()");
    expect(sql).toContain('insert into app.task_links(');
    expect(sql).toContain("'interview', p_interview_id, 'related'");
  });
});

function between(value: string, start: string, end: string) {
  return value.slice(value.indexOf(start), value.indexOf(end));
}
