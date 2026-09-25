import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  DuplicateCandidate,
  DuplicateCandidateRepository,
  DuplicateCandidateReviewResult,
} from '../src/modules/duplicate-candidates/duplicate-candidate-repository.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';

const candidateId = '11111111-1111-4111-8111-111111111111';
const nextId = '22222222-2222-4222-8222-222222222222';

const candidate: DuplicateCandidate = {
  entityType: 'company',
  id: candidateId,
  score: 0.93,
  matchReasons: [{ field: 'legal_name', reason: 'normalized_exact' }],
  decision: 'pending',
  reviewNote: null,
  reviewedAt: null,
  reviewedBy: null,
  createdAt: '2026-09-25T00:00:00Z',
  leftRecord: {
    id: '33333333-3333-4333-8333-333333333333',
    managementNo: 'C-001',
    name: '株式会社サンプル',
    status: 'active',
    secondary: '株式会社サンプル',
  },
  rightRecord: {
    id: '44444444-4444-4444-8444-444444444444',
    managementNo: 'C-002',
    name: 'サンプル株式会社',
    status: 'active',
    secondary: 'サンプル株式会社',
  },
};

const reviewed: DuplicateCandidateReviewResult = {
  entityType: 'company',
  id: candidateId,
  decision: 'duplicate',
  reviewNote: '同一法人として確認',
  reviewedAt: '2026-09-25T01:00:00Z',
  reviewedBy: '55555555-5555-4555-8555-555555555555',
};

const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function repository(
  overrides: Partial<DuplicateCandidateRepository> = {},
): DuplicateCandidateRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    canManage: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() =>
      Promise.resolve({
        items: [candidate],
        nextCursor: { score: 0.81, id: nextId },
      }),
    ),
    review: vi.fn(() => Promise.resolve(reviewed)),
    ...overrides,
  };
}

function app(duplicateCandidates = repository()) {
  const instance = buildApp({ authentication, duplicateCandidates });
  apps.push(instance);
  return instance;
}

describe('Duplicate Candidates API', () => {
  it('rejects unauthenticated requests', async () => {
    const instance = buildApp({
      authentication: {
        authenticate: () => Promise.reject(new Error('invalid token')),
      },
      duplicateCandidates: repository(),
    });
    apps.push(instance);

    const response = await instance.inject({
      method: 'GET',
      url: '/api/v1/duplicate-candidates',
    });

    expect(response.statusCode).toBe(401);
  });

  it('lists pending candidates with normalized defaults and pagination', async () => {
    const list = vi.fn(() =>
      Promise.resolve({
        items: [candidate],
        nextCursor: { score: 0.81, id: nextId },
      }),
    );
    const response = await app(repository({ list })).inject({
      method: 'GET',
      url: '/api/v1/duplicate-candidates?limit=20',
      headers: { authorization: 'Bearer valid' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(`"id":"${candidateId}"`);
    expect(response.body).toContain('"limit":20');
    expect(response.body).toMatch(/"nextCursor":"[^"]+"/);
    expect(list).toHaveBeenCalledWith('valid', {
      entityType: 'all',
      decision: 'pending',
      limit: 20,
    });
  });

  it('decodes the duplicate candidate cursor before repository access', async () => {
    const list = vi.fn(() => Promise.resolve({ items: [], nextCursor: null }));
    const cursor = Buffer.from(
      JSON.stringify({ score: 0.93, id: candidateId }),
    ).toString('base64url');

    const response = await app(repository({ list })).inject({
      method: 'GET',
      url: `/api/v1/duplicate-candidates?entityType=company&decision=all&cursor=${cursor}`,
      headers: { authorization: 'Bearer valid' },
    });

    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith('valid', {
      entityType: 'company',
      decision: 'all',
      limit: 50,
      cursor: { score: 0.93, id: candidateId },
    });
  });

  it('records a human review decision', async () => {
    const review = vi.fn(() => Promise.resolve(reviewed));
    const response = await app(repository({ review })).inject({
      method: 'PATCH',
      url: `/api/v1/duplicate-candidates/company/${candidateId}`,
      headers: { authorization: 'Bearer valid' },
      payload: {
        decision: 'duplicate',
        note: ' 同一法人として確認 ',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(review).toHaveBeenCalledWith(
      'valid',
      'company',
      candidateId,
      {
        decision: 'duplicate',
        note: '同一法人として確認',
      },
    );
  });

  it('enforces read and manage permissions at the API boundary', async () => {
    const readForbidden = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: '/api/v1/duplicate-candidates?entityType=engineer',
      headers: { authorization: 'Bearer valid' },
    });
    expect(readForbidden.statusCode).toBe(403);

    const manageForbidden = await app(
      repository({ canManage: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'PATCH',
      url: `/api/v1/duplicate-candidates/project/${candidateId}`,
      headers: { authorization: 'Bearer valid' },
      payload: { decision: 'hold' },
    });
    expect(manageForbidden.statusCode).toBe(403);
  });

  it('fails closed for invalid filters, cursor, ids, and review decisions', async () => {
    const invalidEntity = await app().inject({
      method: 'GET',
      url: '/api/v1/duplicate-candidates?entityType=person',
      headers: { authorization: 'Bearer valid' },
    });
    expect(invalidEntity.statusCode).toBe(400);

    const invalidDecision = await app().inject({
      method: 'GET',
      url: '/api/v1/duplicate-candidates?decision=maybe',
      headers: { authorization: 'Bearer valid' },
    });
    expect(invalidDecision.statusCode).toBe(400);

    const invalidCursor = await app().inject({
      method: 'GET',
      url: '/api/v1/duplicate-candidates?cursor=not-json',
      headers: { authorization: 'Bearer valid' },
    });
    expect(invalidCursor.statusCode).toBe(400);

    const invalidId = await app().inject({
      method: 'PATCH',
      url: '/api/v1/duplicate-candidates/company/not-a-uuid',
      headers: { authorization: 'Bearer valid' },
      payload: { decision: 'duplicate' },
    });
    expect(invalidId.statusCode).toBe(400);

    const invalidReview = await app().inject({
      method: 'PATCH',
      url: `/api/v1/duplicate-candidates/company/${candidateId}`,
      headers: { authorization: 'Bearer valid' },
      payload: { decision: 'merged' },
    });
    expect(invalidReview.statusCode).toBe(400);
  });
});
