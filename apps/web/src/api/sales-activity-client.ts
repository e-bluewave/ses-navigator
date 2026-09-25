import { ApiClientError } from './client.js';
import type { ApiErrorBody } from './generated.js';
import type {
  ListSalesActivitiesQuery,
  SalesActivityApi,
  SalesActivityCreateResult,
  SalesActivityInput,
  SalesActivityList,
} from './sales-activity-types.js';

export function createSalesActivityApi(options: {
  getAccessToken: () => string | null;
  baseUrl?: string;
  fetch?: typeof fetch;
  createIdempotencyKey?: () => string;
}): SalesActivityApi {
  const baseUrl = options.baseUrl ?? '/api/v1';
  const request = options.fetch ?? fetch;
  const createIdempotencyKey =
    options.createIdempotencyKey ?? (() => crypto.randomUUID());

  async function read<T>(path: string): Promise<T> {
    const token = options.getAccessToken();
    const response = await request(`${baseUrl}${path}`, {
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw await apiError(response);
    return response.json() as Promise<T>;
  }

  async function create<T>(path: string, body: unknown): Promise<T> {
    const token = options.getAccessToken();
    const response = await request(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': createIdempotencyKey(),
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await apiError(response);
    return response.json() as Promise<T>;
  }

  return {
    listCompanySalesActivities(
      companyId: string,
      query: ListSalesActivitiesQuery = {},
    ) {
      const params = new URLSearchParams();
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      if (query.cursor) params.set('cursor', query.cursor);
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return read<SalesActivityList>(
        `/companies/${encodeURIComponent(companyId)}/sales-activities${suffix}`,
      );
    },
    createCompanySalesActivity(companyId: string, input: SalesActivityInput) {
      return create<SalesActivityCreateResult>(
        `/companies/${encodeURIComponent(companyId)}/sales-activities`,
        input,
      );
    },
  };
}

async function apiError(response: Response) {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return new ApiClientError(
    response.status,
    body?.error.code ?? 'unexpected_error',
    body?.error.message ?? 'APIへの接続に失敗しました。',
    body?.error.requestId,
  );
}
