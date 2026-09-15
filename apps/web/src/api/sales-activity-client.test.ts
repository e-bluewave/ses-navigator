import { describe, expect, it, vi } from 'vitest';

import { ApiClientError } from './client.js';
import { createSalesActivityApi } from './sales-activity-client.js';
import type {
  SalesActivityCreateResult,
  SalesActivityInput,
  SalesActivityList,
} from './sales-activity-types.js';

const companyId = '11111111-1111-4111-8111-111111111111';

const listResponse: SalesActivityList = {
  items: [],
  page: { limit: 25, nextCursor: 'next-page' },
};

const createResponse: SalesActivityCreateResult = {
  activity: {
    id: '22222222-2222-4222-8222-222222222222',
    companyId,
    activityType: 'call',
    direction: 'outbound',
    occurredAt: '2026-09-15T05:30:00.000Z',
    subject: '案件状況確認',
    summary: '先方へ状況を確認した',
    result: '9/18に再連絡',
    createdAt: '2026-09-15T05:31:00.000Z',
    updatedAt: '2026-09-15T05:31:00.000Z',
    rowVersion: 1,
  },
  followUpTask: null,
};

const input: SalesActivityInput = {
  activityType: 'call',
  direction: 'outbound',
  occurredAt: '2026-09-15T05:30:00.000Z',
  subject: '案件状況確認',
  summary: '先方へ状況を確認した',
  result: '9/18に再連絡',
  companyContactId: null,
  projectId: null,
  engineerId: null,
  followUp: null,
};

describe('sales activity web client', () => {
  it('lists a company timeline with auth and cursor parameters', async () => {
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify(listResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const api = createSalesActivityApi({
      getAccessToken: () => 'access-token',
      baseUrl: 'https://api.example.test/api/v1',
      fetch: request,
    });

    await expect(
      api.listCompanySalesActivities(companyId, {
        limit: 25,
        cursor: 'cursor-value',
      }),
    ).resolves.toEqual(listResponse);

    expect(request).toHaveBeenCalledOnce();
    const call = request.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error('fetch was not called');
    const [url, init] = call;
    expect(url).toBe(
      `https://api.example.test/api/v1/companies/${companyId}/sales-activities?limit=25&cursor=cursor-value`,
    );
    expect(init?.headers).toEqual({ authorization: 'Bearer access-token' });
  });

  it('creates with a stable client request id header for server idempotency', async () => {
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify(createResponse), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const api = createSalesActivityApi({
      getAccessToken: () => 'access-token',
      baseUrl: '/api/v1',
      fetch: request,
      createIdempotencyKey: () => 'sales-request-1',
    });

    await expect(
      api.createCompanySalesActivity(companyId, input),
    ).resolves.toEqual(createResponse);

    const call = request.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error('fetch was not called');
    const [url, init] = call;
    expect(url).toBe(`/api/v1/companies/${companyId}/sales-activities`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      'content-type': 'application/json',
      'x-request-id': 'sales-request-1',
      authorization: 'Bearer access-token',
    });
    expect(init?.body).toBe(JSON.stringify(input));
  });

  it('maps API errors to ApiClientError without exposing response details', async () => {
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: 'forbidden',
              message: 'company.read permission is required',
              requestId: 'request-403',
            },
          }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const api = createSalesActivityApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });

    const error = await api
      .listCompanySalesActivities(companyId)
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      status: 403,
      code: 'forbidden',
      requestId: 'request-403',
    });
  });
});
