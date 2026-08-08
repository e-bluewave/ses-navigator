import type {
  ApiErrorBody,
  ListProjectsQuery,
  Project,
  ProjectList,
} from './generated.js';

export interface ProjectsApi {
  listProjects(query?: ListProjectsQuery): Promise<ProjectList>;
  getProject(id: string): Promise<Project>;
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

  return {
    listProjects(query = {}) {
      const params = new URLSearchParams();
      if (query.managementNo) params.set('managementNo', query.managementNo);
      if (query.status) params.set('status', query.status);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return get<ProjectList>(`/projects${suffix}`);
    },
    getProject(id) {
      return get<Project>(`/projects/${encodeURIComponent(id)}`);
    },
  };
}
