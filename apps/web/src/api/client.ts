import type {
  ApiErrorBody,
  AuthContext,
  ListProjectsQuery,
  Project,
  ProjectInput,
  ProjectList,
  ProjectAuditList,
  Company,
  CompanyInput,
  CompanyList,
  CompanyAuditList,
  ListCompaniesQuery,
} from './generated.js';

export interface ProjectsApi {
  getAuthContext(): Promise<AuthContext>;
  listProjects(query?: ListProjectsQuery): Promise<ProjectList>;
  getProject(id: string): Promise<Project>;
  createProject(input: ProjectInput): Promise<Project>;
  updateProject(
    id: string,
    rowVersion: number,
    input: ProjectInput,
  ): Promise<Project>;
  deleteProject(id: string, rowVersion: number, reason: string): Promise<void>;
  listProjectAudit(id: string): Promise<ProjectAuditList>;
  listCompanies(query?: ListCompaniesQuery): Promise<CompanyList>;
  getCompany(id: string): Promise<Company>;
  createCompany(input: CompanyInput): Promise<Company>;
  updateCompany(
    id: string,
    rowVersion: number,
    input: CompanyInput,
  ): Promise<Company>;
  deleteCompany(id: string, rowVersion: number, reason: string): Promise<void>;
  listCompanyAudit(id: string): Promise<CompanyAuditList>;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

export function createProjectsApi(options: {
  getAccessToken: () => string | null;
  baseUrl?: string;
  fetch?: typeof fetch;
}): ProjectsApi {
  const baseUrl = options.baseUrl ?? '/api/v1';
  const request = options.fetch ?? fetch;

  async function get<T>(path: string): Promise<T> {
    const token = options.getAccessToken();
    const response = await request(`${baseUrl}${path}`, {
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const body = (await response
        .json()
        .catch(() => null)) as ApiErrorBody | null;
      throw new ApiClientError(
        response.status,
        body?.error.code ?? 'unexpected_error',
        body?.error.message ?? 'APIへの接続に失敗しました。',
        body?.error.requestId,
      );
    }
    return response.json() as Promise<T>;
  }

  async function send<T>(
    path: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body: unknown,
    rowVersion?: number,
  ): Promise<T> {
    const token = options.getAccessToken();
    const response = await request(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
        ...(rowVersion === undefined ? {} : { 'if-match': `"${rowVersion}"` }),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = (await response
        .json()
        .catch(() => null)) as ApiErrorBody | null;
      throw new ApiClientError(
        response.status,
        error?.error.code ?? 'unexpected_error',
        error?.error.message ?? 'APIへの接続に失敗しました。',
        error?.error.requestId,
      );
    }
    return response.status === 204
      ? (undefined as T)
      : (response.json() as Promise<T>);
  }

  return {
    getAuthContext() {
      return get<AuthContext>('/auth/context');
    },
    listProjects(query = {}) {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.status) params.set('status', query.status);
      if (query.recruitmentStatus)
        params.set('recruitmentStatus', query.recruitmentStatus);
      if (query.cursor) params.set('cursor', query.cursor);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return get<ProjectList>(`/projects${suffix}`);
    },
    getProject(id) {
      return get<Project>(`/projects/${encodeURIComponent(id)}`);
    },
    createProject(input) {
      return send<Project>('/projects', 'POST', input);
    },
    updateProject(id, rowVersion, input) {
      return send<Project>(
        `/projects/${encodeURIComponent(id)}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    deleteProject(id, rowVersion, reason) {
      return send<void>(
        `/projects/${encodeURIComponent(id)}`,
        'DELETE',
        { reason },
        rowVersion,
      );
    },
    listProjectAudit(id) {
      return get<ProjectAuditList>(`/projects/${encodeURIComponent(id)}/audit`);
    },
    listCompanies(query = {}) {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.status) params.set('status', query.status);
      if (query.cursor) params.set('cursor', query.cursor);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return get<CompanyList>(`/companies${suffix}`);
    },
    getCompany(id) {
      return get<Company>(`/companies/${encodeURIComponent(id)}`);
    },
    createCompany(input) {
      return send<Company>('/companies', 'POST', input);
    },
    updateCompany(id, rowVersion, input) {
      return send<Company>(
        `/companies/${encodeURIComponent(id)}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    deleteCompany(id, rowVersion, reason) {
      return send<void>(
        `/companies/${encodeURIComponent(id)}`,
        'DELETE',
        { reason },
        rowVersion,
      );
    },
    listCompanyAudit(id) {
      return get<CompanyAuditList>(
        `/companies/${encodeURIComponent(id)}/audit`,
      );
    },
  };
}
