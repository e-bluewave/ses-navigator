import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';
import { dataApiSchemaHeaders } from '../../shared/supabase-schema.js';

export type TaskStatus =
  'open' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
export type TaskScope =
  'all' | 'incomplete' | 'completed' | 'overdue' | 'today' | 'upcoming';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskDueCategory =
  'completed' | 'overdue' | 'today' | 'upcoming' | 'none';

export interface MyTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  isCompleted: boolean;
  isOverdue: boolean;
  isDueToday: boolean;
  isUpcoming: boolean;
  dueCategory: TaskDueCategory;
  assignment: {
    assignmentType: 'owner' | 'collaborator' | 'watcher';
    assignedAt: string;
  };
  links: Array<{
    resourceType: string;
    resourceId: string;
    linkType: 'related' | 'blocks' | 'blocked_by' | 'generated_from';
  }>;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
}

export interface MyTaskUpdate {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
}

export interface MyTaskUpdateInput {
  status?: TaskStatus;
  dueAt?: string;
  clearDueAt?: boolean;
  reason?: string | null;
}

export interface TaskRepository {
  canRead(token: string): Promise<boolean>;
  canManage(token: string): Promise<boolean>;
  list(
    token: string,
    query: { scope: TaskScope; timeZone: string; limit: number },
  ): Promise<MyTask[]>;
  update(
    token: string,
    id: string,
    rowVersion: number,
    input: MyTaskUpdateInput,
  ): Promise<MyTaskUpdate | null>;
}

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  completed_at: string | null;
  is_completed: boolean;
  is_overdue: boolean;
  is_due_today: boolean;
  is_upcoming: boolean;
  due_category: TaskDueCategory;
  assignment: {
    assignment_type: 'owner' | 'collaborator' | 'watcher';
    assigned_at: string;
  };
  links: Array<{
    resource_type: string;
    resource_id: string;
    link_type: 'related' | 'blocks' | 'blocked_by' | 'generated_from';
  }>;
  created_at: string;
  updated_at: string;
  row_version: number;
};

type TaskUpdateRow = Omit<
  TaskRow,
  | 'is_completed'
  | 'is_overdue'
  | 'is_due_today'
  | 'is_upcoming'
  | 'due_category'
  | 'assignment'
  | 'links'
>;

export class SupabaseTaskRepository implements TaskRepository {
  canRead(token: string) {
    return this.hasPermission(token, 'task.read');
  }

  canManage(token: string) {
    return this.hasPermission(token, 'task.manage');
  }

  private async hasPermission(token: string, permission: string) {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: permission }),
    });
    return (await response.json()) === true;
  }

  async list(
    token: string,
    query: { scope: TaskScope; timeZone: string; limit: number },
  ) {
    const response = await this.request(token, '/rpc/list_my_tasks', {
      method: 'POST',
      body: JSON.stringify({
        p_scope: query.scope,
        p_time_zone: query.timeZone,
        p_limit: query.limit,
      }),
    });
    const result = (await response.json()) as { items: TaskRow[] };
    return result.items.map(toTask);
  }

  async update(
    token: string,
    id: string,
    rowVersion: number,
    input: MyTaskUpdateInput,
  ) {
    const response = await this.request(token, '/rpc/update_my_task', {
      method: 'POST',
      body: JSON.stringify({
        p_task_id: id,
        p_row_version: rowVersion,
        p_status: input.status ?? null,
        p_due_at: input.dueAt ?? null,
        p_clear_due_at: input.clearDueAt ?? false,
        p_reason: input.reason ?? null,
      }),
    });
    const row = (await response.json()) as TaskUpdateRow | null;
    return row ? toTaskUpdate(row) : null;
  }

  private async request(token: string, path: string, init: RequestInit) {
    const response = await fetch(
      `${requiredEnv('SUPABASE_URL')}/rest/v1${path}`,
      {
        ...init,
        headers: {
          apikey: requiredEnv('SUPABASE_ANON_KEY'),
          authorization: `Bearer ${token}`,
          ...dataApiSchemaHeaders(path),
          'content-type': 'application/json',
          accept: 'application/json',
          ...(init.headers ?? {}),
        },
      },
    );
    if (!response.ok)
      throw new ApiError(
        502,
        'upstream_error',
        'Task data service request failed',
      );
    return response;
  }
}

function toTask(row: TaskRow): MyTask {
  return {
    ...toTaskUpdate(row),
    isCompleted: row.is_completed,
    isOverdue: row.is_overdue,
    isDueToday: row.is_due_today,
    isUpcoming: row.is_upcoming,
    dueCategory: row.due_category,
    assignment: {
      assignmentType: row.assignment.assignment_type,
      assignedAt: row.assignment.assigned_at,
    },
    links: row.links.map((link) => ({
      resourceType: link.resource_type,
      resourceId: link.resource_id,
      linkType: link.link_type,
    })),
  };
}

function toTaskUpdate(row: TaskUpdateRow): MyTaskUpdate {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}
