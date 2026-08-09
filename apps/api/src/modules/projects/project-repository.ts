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

export interface ProjectRepository {
  canRead(accessToken: string): Promise<boolean>;
  list(
    accessToken: string,
    query: ProjectListQuery,
  ): Promise<ProjectListResult>;
  findById(accessToken: string, id: string): Promise<Project | null>;
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

export class SupabaseProjectRepository implements ProjectRepository {
  async canRead(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'project.read' }),
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

  private async request(
    token: string,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const response = await fetch(
      `${requiredEnv('SUPABASE_URL')}/rest/v1${path}`,
      {
        ...init,
        headers: {
          apikey: requiredEnv('SUPABASE_ANON_KEY'),
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          ...init.headers,
        },
      },
    );
    if (!response.ok)
      throw new ApiError(
        502,
        'data_api_error',
        'The data service could not complete the request',
      );
    return response;
  }
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
