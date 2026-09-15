import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';
import { dataApiSchemaHeaders } from '../../shared/supabase-schema.js';

export type SalesActivityType =
  'call' | 'email' | 'meeting' | 'visit' | 'proposal' | 'follow_up' | 'other';
export type SalesActivityDirection = 'inbound' | 'outbound' | 'internal';
export type FollowUpPriority = 'low' | 'normal' | 'high' | 'urgent';
export type FollowUpStatus =
  'open' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';

export interface SalesActivityRelatedContact {
  id: string;
  familyName: string;
  givenName: string | null;
  departmentName: string | null;
  positionTitle: string | null;
}

export interface SalesActivityRelatedProject {
  id: string;
  managementNo: string;
  projectName: string;
}

export interface SalesActivityRelatedEngineer {
  id: string;
  managementNo: string;
  displayName: string;
}

export interface SalesActivityFollowUpTask {
  id: string;
  title: string;
  status: FollowUpStatus;
  priority: FollowUpPriority;
  dueAt: string | null;
  completedAt: string | null;
  rowVersion: number;
}

export interface SalesActivity {
  id: string;
  companyId: string;
  activityType: SalesActivityType;
  direction: SalesActivityDirection | null;
  occurredAt: string;
  subject: string;
  summary: string;
  result: string | null;
  contact: SalesActivityRelatedContact | null;
  project: SalesActivityRelatedProject | null;
  engineer: SalesActivityRelatedEngineer | null;
  followUpTask: SalesActivityFollowUpTask | null;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
}

export interface SalesActivityListQuery {
  limit: number;
  cursor?: { occurredAt: string; id: string };
}

export interface SalesActivityListResult {
  items: SalesActivity[];
  nextCursor: { occurredAt: string; id: string } | null;
}

export interface SalesActivityFollowUpInput {
  title: string;
  description: string | null;
  dueAt: string;
  priority: FollowUpPriority;
}

export interface SalesActivityCreateInput {
  activityType: SalesActivityType;
  direction: SalesActivityDirection | null;
  occurredAt: string;
  subject: string;
  summary: string;
  result: string | null;
  companyContactId: string | null;
  projectId: string | null;
  engineerId: string | null;
  followUp: SalesActivityFollowUpInput | null;
}

export interface SalesActivityCreateResult {
  activity: Omit<
    SalesActivity,
    'contact' | 'project' | 'engineer' | 'followUpTask'
  >;
  followUpTask:
    | (SalesActivityFollowUpTask & {
        description: string | null;
      })
    | null;
}

export interface SalesActivityRepository {
  canRead(accessToken: string): Promise<boolean>;
  canManage(accessToken: string): Promise<boolean>;
  canManageTasks(accessToken: string): Promise<boolean>;
  list(
    accessToken: string,
    companyId: string,
    query: SalesActivityListQuery,
  ): Promise<SalesActivityListResult>;
  create(
    accessToken: string,
    companyId: string,
    input: SalesActivityCreateInput,
    requestId: string,
  ): Promise<SalesActivityCreateResult>;
}

type SalesActivityRow = {
  id: string;
  company_id: string;
  activity_type: SalesActivityType;
  direction: SalesActivityDirection | null;
  occurred_at: string;
  subject: string;
  summary: string;
  result: string | null;
  contact: {
    id: string;
    family_name: string;
    given_name: string | null;
    department_name: string | null;
    position_title: string | null;
  } | null;
  project: {
    id: string;
    management_no: string;
    project_name: string;
  } | null;
  engineer: {
    id: string;
    management_no: string;
    display_name: string;
  } | null;
  follow_up_task: FollowUpTaskRow | null;
  created_at: string;
  updated_at: string;
  row_version: number;
};

type FollowUpTaskRow = {
  id: string;
  title: string;
  description?: string | null;
  status: FollowUpStatus;
  priority: FollowUpPriority;
  due_at: string | null;
  completed_at: string | null;
  row_version: number;
};

type SalesActivityListRow = {
  items: SalesActivityRow[];
  next_cursor: { occurred_at: string; id: string } | null;
};

type SalesActivityCreateRow = {
  activity: {
    id: string;
    company_id: string;
    activity_type: SalesActivityType;
    direction: SalesActivityDirection | null;
    occurred_at: string;
    subject: string;
    summary: string;
    result: string | null;
    created_at: string;
    updated_at: string;
    row_version: number;
  };
  follow_up_task: FollowUpTaskRow | null;
};

export class SupabaseSalesActivityRepository implements SalesActivityRepository {
  canRead(token: string) {
    return this.hasPermission(token, 'company.read');
  }

  canManage(token: string) {
    return this.hasPermission(token, 'company.manage');
  }

  canManageTasks(token: string) {
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
    companyId: string,
    query: SalesActivityListQuery,
  ): Promise<SalesActivityListResult> {
    const response = await this.request(
      token,
      '/rpc/list_company_sales_activities',
      {
        method: 'POST',
        body: JSON.stringify({
          p_company_id: companyId,
          p_limit: query.limit,
          p_cursor_occurred_at: query.cursor?.occurredAt ?? null,
          p_cursor_id: query.cursor?.id ?? null,
        }),
      },
      'Sales activity list request was not permitted',
    );
    const row = (await response.json()) as SalesActivityListRow;
    return {
      items: row.items.map(toSalesActivity),
      nextCursor: row.next_cursor
        ? {
            occurredAt: row.next_cursor.occurred_at,
            id: row.next_cursor.id,
          }
        : null,
    };
  }

  async create(
    token: string,
    companyId: string,
    input: SalesActivityCreateInput,
    requestId: string,
  ): Promise<SalesActivityCreateResult> {
    const response = await this.request(
      token,
      '/rpc/create_sales_activity_with_follow_up',
      {
        method: 'POST',
        body: JSON.stringify({
          p_company_id: companyId,
          p_activity_type: input.activityType,
          p_occurred_at: input.occurredAt,
          p_subject: input.subject,
          p_summary: input.summary,
          p_request_id: requestId,
          p_direction: input.direction,
          p_result: input.result,
          p_company_contact_id: input.companyContactId,
          p_project_id: input.projectId,
          p_engineer_id: input.engineerId,
          p_follow_up_title: input.followUp?.title ?? null,
          p_follow_up_description: input.followUp?.description ?? null,
          p_follow_up_due_at: input.followUp?.dueAt ?? null,
          p_follow_up_priority: input.followUp?.priority ?? null,
        }),
      },
      'Sales activity create request was not permitted',
    );
    const row = (await response.json()) as SalesActivityCreateRow;
    return {
      activity: {
        id: row.activity.id,
        companyId: row.activity.company_id,
        activityType: row.activity.activity_type,
        direction: row.activity.direction,
        occurredAt: row.activity.occurred_at,
        subject: row.activity.subject,
        summary: row.activity.summary,
        result: row.activity.result,
        createdAt: row.activity.created_at,
        updatedAt: row.activity.updated_at,
        rowVersion: row.activity.row_version,
      },
      followUpTask: row.follow_up_task
        ? {
            id: row.follow_up_task.id,
            title: row.follow_up_task.title,
            description: row.follow_up_task.description ?? null,
            status: row.follow_up_task.status,
            priority: row.follow_up_task.priority,
            dueAt: row.follow_up_task.due_at,
            completedAt: row.follow_up_task.completed_at,
            rowVersion: row.follow_up_task.row_version,
          }
        : null,
    };
  }

  private async request(
    token: string,
    path: string,
    init: RequestInit,
    forbiddenMessage = 'Sales activity data request was not permitted',
  ) {
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
    if (response.status === 401 || response.status === 403)
      throw new ApiError(403, 'forbidden', forbiddenMessage);
    if (!response.ok)
      throw new ApiError(
        502,
        'upstream_error',
        'Sales activity data service request failed',
      );
    return response;
  }
}

function toSalesActivity(row: SalesActivityRow): SalesActivity {
  return {
    id: row.id,
    companyId: row.company_id,
    activityType: row.activity_type,
    direction: row.direction,
    occurredAt: row.occurred_at,
    subject: row.subject,
    summary: row.summary,
    result: row.result,
    contact: row.contact
      ? {
          id: row.contact.id,
          familyName: row.contact.family_name,
          givenName: row.contact.given_name,
          departmentName: row.contact.department_name,
          positionTitle: row.contact.position_title,
        }
      : null,
    project: row.project
      ? {
          id: row.project.id,
          managementNo: row.project.management_no,
          projectName: row.project.project_name,
        }
      : null,
    engineer: row.engineer
      ? {
          id: row.engineer.id,
          managementNo: row.engineer.management_no,
          displayName: row.engineer.display_name,
        }
      : null,
    followUpTask: row.follow_up_task
      ? {
          id: row.follow_up_task.id,
          title: row.follow_up_task.title,
          status: row.follow_up_task.status,
          priority: row.follow_up_task.priority,
          dueAt: row.follow_up_task.due_at,
          completedAt: row.follow_up_task.completed_at,
          rowVersion: row.follow_up_task.row_version,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}
