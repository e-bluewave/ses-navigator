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
  managementNo?: string;
  status?: string;
}

export interface ProjectRepository {
  canRead(accessToken: string): Promise<boolean>;
  list(accessToken: string, query: ProjectListQuery): Promise<Project[]>;
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

  async list(token: string, query: ProjectListQuery): Promise<Project[]> {
    const params = new URLSearchParams({
      select:
        'id,management_no,project_name,summary,project_status,recruitment_status,planned_start_on,planned_end_on,updated_at,row_version',
      deleted_at: 'is.null',
      order: 'updated_at.desc,id.desc',
      limit: String(query.limit),
    });
    if (query.managementNo !== undefined)
      params.set('management_no', `eq.${query.managementNo}`);
    if (query.status !== undefined)
      params.set('project_status', `eq.${query.status}`);
    const response = await this.request(
      token,
      `/projects?${params.toString()}`,
    );
    return ((await response.json()) as ProjectRow[]).map(toProject);
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
