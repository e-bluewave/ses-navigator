import { ApiClientError } from './client.js';
import type { ApiErrorBody } from './generated.js';
import type {
  DuplicateCandidateApi,
  DuplicateCandidateList,
  DuplicateCandidateReviewInput,
  DuplicateCandidateReviewResult,
  DuplicateEntityType,
  ListDuplicateCandidatesQuery,
} from './duplicate-candidate-types.js';

export function createDuplicateCandidateApi(options: {
  getAccessToken: () => string | null;
  baseUrl?: string;
  fetch?: typeof fetch;
}): DuplicateCandidateApi {
  const baseUrl = options.baseUrl ?? '/api/v1';
  const request = options.fetch ?? fetch;

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = options.getAccessToken();
    const response = await request(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.body === undefined
          ? {}
          : { 'content-type': 'application/json' }),
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) throw await apiError(response);
    return response.json() as Promise<T>;
  }

  return {
    listDuplicateCandidates(query: ListDuplicateCandidatesQuery = {}) {
      const params = new URLSearchParams();
      if (query.entityType) params.set('entityType', query.entityType);
      if (query.decision) params.set('decision', query.decision);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      if (query.cursor) params.set('cursor', query.cursor);
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return call<DuplicateCandidateList>(`/duplicate-candidates${suffix}`);
    },

    reviewDuplicateCandidate(
      entityType: DuplicateEntityType,
      candidateId: string,
      input: DuplicateCandidateReviewInput,
    ) {
      return call<DuplicateCandidateReviewResult>(
        `/duplicate-candidates/${encodeURIComponent(entityType)}/${encodeURIComponent(candidateId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(input),
        },
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
