import { dataApiSchemaHeaders } from '../../shared/supabase-schema.js';
import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export interface Project {
  id: string;
  managementNo: string;
  projectName: string;
  summary: string | null;
  projectStatus: string;
  recruitmentStatus: string;
  plannedStartOn: string | null;
  plannedEndOn: string | null;
  updatedAt: string;
  rowVersion: number;
}

export interface ProjectListQuery {
  limit: number;
  cursor?: { updatedAt: string; id: string };
  query?: string;
  recruitmentStatus?: string;
  status?: string;
}

export interface ProjectListResult {
  items: Project[];
  nextCursor: { updatedAt: string; id: string } | null;
}

export interface ProjectAuditEvent {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  action: string;
  requestId: string | null;
}

export interface ProjectInput {
  managementNo: string;
  projectName: string;
  summary: string | null;
  projectStatus: string;
  recruitmentStatus: string;
  plannedStartOn: string | null;
  plannedEndOn: string | null;
}

export interface ProjectRepository {
  canRead(accessToken: string): Promise<boolean>;
  canManage(accessToken: string): Promise<boolean>;
  canReadAudit(accessToken: string): Promise<boolean>;
  list(
    accessToken: string,
    query: ProjectListQuery,
  ): Promise<ProjectListResult>;
  findById(accessToken: string, id: string): Promise<Project | null>;
  create(accessToken: string, input: ProjectInput): Promise<Project>;
  update(
    accessToken: string,
    id: string,
    rowVersion: number,
    input: ProjectInput,
  ): Promise<Project | null>;
  softDelete(
    accessToken: string,
    id: string,
    rowVersion: number,
    reason: string,
    requestId: string,
  ): Promise<boolean>;
  listAudit(accessToken: string, id: string): Promise<ProjectAuditEvent[]>;
}

type ProjectRow = {
  id: string;
  management_no: string;
  project_name: string;
  summary: string | null;
  project_status: string;
  recruitment_status: string;
  planned_start_on: string | null;
  planned_end_on: string | null;
  updated_at: string;
  row_version: number;
};

type AuditRow = {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  action: string;
  request_id: string | null;
};

type FetchRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

interface FetchResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

export class SupabaseProjectRepository implements ProjectRepository {
  async canRead(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'project.read' }),
    });
    return (await response.json()) === true;
  }

  async canManage(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'project.manage' }),
    });
    return (await response.json()) === true;
  }

  async canReadAudit(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'audit.read' }),
    });
    return (await response.json()) === true;
  }

  async list(
    token: string,
    query: ProjectListQuery,
  ): Promise<ProjectListResult> {
    const params = new URLSearchParams({
      select:
        'id,management_no,project_name,summary,project_status,recruitment_status,planned_start_on,planned_end_on,updated_at,row_version',
      deleted_at: 'is.null',
      order: 'updated_at.desc,id.desc',
      limit: String(query.limit + 1),
    });
    const compoundFilters: string[] = [];
    if (query.query !== undefined) {
      const pattern = `"*${escapeFilterValue(query.query)}*"`;
      compoundFilters.push(
        `or(management_no.ilike.${pattern},project_name.ilike.${pattern})`,
      );
    }
    if (query.status !== undefined)
      params.set('project_status', `eq.${query.status}`);
    if (query.recruitmentStatus !== undefined)
      params.set('recruitment_status', `eq.${query.recruitmentStatus}`);
    if (query.cursor !== undefined)
      compoundFilters.push(
        `or(updated_at.lt.${query.cursor.updatedAt},and(updated_at.eq.${query.cursor.updatedAt},id.lt.${query.cursor.id}))`,
      );
    if (compoundFilters.length === 1)
      params.set('and', `(${compoundFilters[0]})`);
    if (compoundFilters.length > 1)
      params.set('and', `(${compoundFilters.join(',')})`);
    const response = await this.request(
      token,
      `/projects?${params.toString()}`,
    );
    const rows = (await response.json()) as ProjectRow[];
    const visibleRows = rows.slice(0, query.limit);
    const last = visibleRows.at(-1);
    return {
      items: visibleRows.map(toProject),
      nextCursor:
        rows.length > query.limit && last !== undefined
          ? { updatedAt: last.updated_at, id: last.id }
          : null,
    };
  }

  async findById(token: string, id: string): Promise<Project | null> {
    const params = new URLSearchParams({
      select:
        'id,management_no,project_name,summary,project_status,recruitment_status,planned_start_on,planned_end_on,updated_at,row_version',
      id: `eq.${id}`,
      deleted_at: 'is.null',
      limit: '1',
    });
    const response = await this.request(
      token,
      `/projects?${params.toString()}`,
    );
    const rows = (await response.json()) as ProjectRow[];
    return rows[0] === undefined ? null : toProject(rows[0]);
  }

  async create(token: string, input: ProjectInput): Promise<Project> {
    const tenantResponse = await this.request(token, '/rpc/current_tenant_id', {
      method: 'POST',
      body: '{}',
    });
    const tenantId = (await tenantResponse.json()) as string | null;
    if (tenantId === null)
      throw new ApiError(403, 'forbidden', 'An active tenant is required');
    const response = await this.request(token, '/projects', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify(toProjectWriteRow(input, tenantId)),
    });
    return toProject(((await response.json()) as ProjectRow[])[0]!);
  }

  async update(
    token: string,
    id: string,
    rowVersion: number,
    input: ProjectInput,
  ): Promise<Project | null> {
    const params = new URLSearchParams({
      id: `eq.${id}`,
      row_version: `eq.${rowVersion}`,
      deleted_at: 'is.null',
    });
    const response = await this.request(
      token,
      `/projects?${params.toString()}`,
      {
        method: 'PATCH',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify(toProjectWriteRow(input)),
      },
    );
    const rows = (await response.json()) as ProjectRow[];
    return rows[0] === undefined ? null : toProject(rows[0]);
  }

  async softDelete(
    token: string,
    id: string,
    rowVersion: number,
    reason: string,
    requestId: string,
  ): Promise<boolean> {
    const response = await this.request(token, '/rpc/soft_delete_project', {
      method: 'POST',
      body: JSON.stringify({
        p_project_id: id,
        p_row_version: rowVersion,
        p_delete_reason: reason,
        p_request_id: requestId,
      }),
    });
    return (await response.json()) === true;
  }

  async listAudit(token: string, id: string): Promise<ProjectAuditEvent[]> {
    const params = new URLSearchParams({
      select: 'id,occurred_at,actor_user_id,action,request_id',
      resource_type: 'eq.project',
      resource_id: `eq.${id}`,
      order: 'occurred_at.desc',
      limit: '50',
    });
    const response = await this.request(
      token,
      `/audit_event_summaries?${params.toString()}`,
    );
    return ((await response.json()) as AuditRow[]).map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at,
      actorUserId: row.actor_user_id,
      action: row.action,
      requestId: row.request_id,
    }));
  }

  private async request(
    token: string,
    path: string,
    init: FetchRequestInit = {},
  ): Promise<FetchResponse> {
    const response = (await fetch(
      `${requiredEnv('SUPABASE_URL')}/rest/v1${path}`,
      {
        ...init,
        headers: {
          apikey: requiredEnv('SUPABASE_ANON_KEY'),
          authorization: `Bearer ${token}`,
          ...dataApiSchemaHeaders(path),
          'content-type': 'application/json',
          ...init.headers,
        },
      },
    )) as unknown as FetchResponse;
    if (!response.ok)
      throw new ApiError(
        502,
        'data_api_error',
        'The data service could not complete the request',
      );
    return response;
  }
}

function toProjectWriteRow(input: ProjectInput, tenantId?: string) {
  return {
    ...(tenantId === undefined ? {} : { tenant_id: tenantId }),
    management_no: input.managementNo,
    project_name: input.projectName,
    project_name_normalized: input.projectName.normalize('NFKC').toLowerCase(),
    summary: input.summary,
    project_status: input.projectStatus,
    recruitment_status: input.recruitmentStatus,
    planned_start_on: input.plannedStartOn,
    planned_end_on: input.plannedEndOn,
  };
}

function escapeFilterValue(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('*', '\\*');
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    managementNo: row.management_no,
    projectName: row.project_name,
    summary: row.summary,
    projectStatus: row.project_status,
    recruitmentStatus: row.recruitment_status,
    plannedStartOn: row.planned_start_on,
    plannedEndOn: row.planned_end_on,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}
