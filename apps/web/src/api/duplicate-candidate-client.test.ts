import { describe, expect, it, vi } from 'vitest';

import { ApiClientError } from './client.js';
import { createDuplicateCandidateApi } from './duplicate-candidate-client.js';
import type {
  DuplicateCandidateList,
  DuplicateCandidateReviewResult,
} from './duplicate-candidate-types.js';

const candidateId = '11111111-1111-4111-8111-111111111111';

const listResponse: DuplicateCandidateList = {
  items: [],
  page: { limit: 25, nextCursor: 'next-page' },
};

const reviewResponse: DuplicateCandidateReviewResult = {
  entityType: 'company',
  id: candidateId,
  decision: 'duplicate',
  reviewNote: '同一法人',
  reviewedAt: '2026-09-25T01:00:00Z',
  reviewedBy: '22222222-2222-4222-8222-222222222222',
};

describe('duplicate candidate web client', () => {
  it('lists candidates with auth and filter parameters', async () => {
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify(listResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const api = createDuplicateCandidateApi({
      getAccessToken: () => 'access-token',
      baseUrl: 'https://api.example.test/api/v1',
      fetch: request,
    });

    await expect(
      api.listDuplicateCandidates({
        entityType: 'engineer',
        decision: 'pending',
        limit: 25,
        cursor: 'cursor-value',
      }),
    ).resolves.toEqual(listResponse);

    const call = request.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error('fetch was not called');
    const [url, init] = call;
    expect(url).toBe(
      'https://api.example.test/api/v1/duplicate-candidates?entityType=engineer&decision=pending&limit=25&cursor=cursor-value',
    );
    expect(init?.headers).toEqual({ authorization: 'Bearer access-token' });
  });

  it('saves a human review decision', async () => {
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify(reviewResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const api = createDuplicateCandidateApi({
      getAccessToken: () => 'access-token',
      baseUrl: '/api/v1',
      fetch: request,
    });

    await expect(
      api.reviewDuplicateCandidate('company', candidateId, {
        decision: 'duplicate',
        note: '同一法人',
      }),
    ).resolves.toEqual(reviewResponse);

    const call = request.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error('fetch was not called');
    const [url, init] = call;
    expect(url).toBe(`/api/v1/duplicate-candidates/company/${candidateId}`);
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer access-token',
    });
    expect(init?.body).toBe(
      JSON.stringify({ decision: 'duplicate', note: '同一法人' }),
    );
  });

  it('maps API errors to ApiClientError', async () => {
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: 'forbidden',
              message: 'engineer.manage permission is required',
              requestId: 'request-403',
            },
          }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const api = createDuplicateCandidateApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });

    const error = await api
      .reviewDuplicateCandidate('engineer', candidateId, {
        decision: 'hold',
        note: null,
      })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      status: 403,
      code: 'forbidden',
      requestId: 'request-403',
    });
  });
});
