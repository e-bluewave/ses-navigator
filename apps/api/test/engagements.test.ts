import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  Engagement,
  EngagementInput,
  EngagementRepository,
  EngagementSummary,
} from '../src/modules/engagements/engagement-repository.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';

const summary: EngagementSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  engagementNo: 'ENG-000001',
  contractId: '22222222-2222-4222-8222-222222222222',
  proposalId: '33333333-3333-4333-8333-333333333333',
  engineerId: '44444444-4444-4444-8444-444444444444',
  engineerName: '山田 太郎',
  contractTitle: '基幹システム刷新 SES契約',
  status: 'active',
  plannedStartDate: '2026-09-01',
  plannedEndDate: '2027-02-28',
  actualStartDate: '2026-09-01',
  actualEndDate: null,
  roleName: 'バックエンドエンジニア',
  workLocation: '東京都',
  remoteFrequency: '週3日',
  updatedAt: '2026-08-14T00:00:00Z',
  rowVersion: 2,
};

const engagement: Engagement = {
  ...summary,
  previousEngagementId: null,
  conditions: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      versionNo: 1,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
      monthlySalesAmount: 900000,
      monthlyCostAmount: 650000,
      currency: 'JPY',
      settlementLowerHours: 140,
      settlementUpperHours: 180,
      workLocation: '東京都',
      remoteFrequency: '週3日',
      notes: '初回条件',
      createdAt: '2026-08-14T00:00:00Z',
    },
  ],
  statusHistories: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      fromStatus: 'preparing',
      toStatus: 'active',
      changeReason: '参画開始',
      changedAt: '2026-09-01T00:00:00Z',
    },
  ],
};

const input: EngagementInput = {
  engagementNo: engagement.engagementNo,
  contractId: engagement.contractId,
  engineerId: engagement.engineerId,
  previousEngagementId: null,
  plannedStartDate: '2026-09-01',
  plannedEndDate: '2027-02-28',
  roleName: engagement.roleName,
  workLocation: engagement.workLocation,
  remoteFrequency: engagement.remoteFrequency,
  condition: {
    effectiveFrom: '2026-09-01',
    effectiveTo: null,
    monthlySalesAmount: 900000,
    monthlyCostAmount: 650000,
    currency: 'JPY',
    settlementLowerHours: 140,
    settlementUpperHours: 180,
    notes: '初回条件',
  },
};

const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function repository(
  overrides: Partial<EngagementRepository> = {},
): EngagementRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    canManage: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() => Promise.resolve({ items: [summary], nextCursor: null })),
    findById: vi.fn(() => Promise.resolve(engagement)),
    create: vi.fn(() =>
      Promise.resolve({ ...engagement, status: 'draft' as const }),
    ),
    update: vi.fn(() =>
      Promise.resolve({ ...engagement, status: 'draft' as const }),
    ),
    transitionStatus: vi.fn(() => Promise.resolve(engagement)),
    ...overrides,
  };
}

function app(engagements = repository()) {
  const instance = buildApp({ authentication, engagements });
  apps.push(instance);
  return instance;
}

describe('engagement read API', () => {
  it('lists authorized engagement summaries with filters', async () => {
    const list = vi.fn(() =>
      Promise.resolve({ items: [summary], nextCursor: null }),
    );
    const response = await app(repository({ list })).inject({
      method: 'GET',
      url: '/api/v1/engagements?q=山田&status=active&limit=20',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [summary],
      page: { limit: 20, nextCursor: null },
    });
    expect(list).toHaveBeenCalledWith('valid', {
      limit: 20,
      query: '山田',
      status: 'active',
    });
  });

  it('requires contract.read', async () => {
    const response = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: '/api/v1/engagements',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('encodes and accepts the next cursor page', async () => {
    const next = { updatedAt: summary.updatedAt, id: summary.id };
    const list = vi.fn(() =>
      Promise.resolve({ items: [summary], nextCursor: next }),
    );
    const first = await app(repository({ list })).inject({
      method: 'GET',
      url: '/api/v1/engagements?limit=1',
      headers: { authorization: 'Bearer valid' },
    });
    const firstBody = JSON.parse(first.body) as {
      page: { nextCursor: string | null };
    };
    const cursor = firstBody.page.nextCursor!;
    expect(cursor).toBeTruthy();
    const second = await app(repository({ list })).inject({
      method: 'GET',
      url: `/api/v1/engagements?limit=1&cursor=${encodeURIComponent(cursor)}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(second.statusCode).toBe(200);
    expect(list).toHaveBeenLastCalledWith('valid', { limit: 1, cursor: next });
  });

  it('returns detail with condition versions and status history', async () => {
    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/engagements/${engagement.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(engagement);
  });

  it('normalizes an inaccessible engagement to 404', async () => {
    const response = await app(
      repository({ findById: vi.fn(() => Promise.resolve(null)) }),
    ).inject({
      method: 'GET',
      url: `/api/v1/engagements/${engagement.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('rejects an unknown status before repository access', async () => {
    const response = await app().inject({
      method: 'GET',
      url: '/api/v1/engagements?status=unknown',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects malformed cursor input', async () => {
    const response = await app().inject({
      method: 'GET',
      url: '/api/v1/engagements?cursor=not-a-cursor',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('engagement write API', () => {
  it('creates a manual engagement draft', async () => {
    const create = vi.fn(() =>
      Promise.resolve({
        ...engagement,
        status: 'draft' as const,
        rowVersion: 1,
      }),
    );
    const response = await app(repository({ create })).inject({
      method: 'POST',
      url: '/api/v1/engagements',
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers.etag).toBe('"1"');
    expect(create).toHaveBeenCalledWith('valid', input, expect.any(String));
  });

  it('requires contract.manage to create', async () => {
    const response = await app(
      repository({ canManage: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: '/api/v1/engagements',
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(response.statusCode).toBe(403);
  });

  it('updates a draft using If-Match', async () => {
    const update = vi.fn(() =>
      Promise.resolve({
        ...engagement,
        status: 'draft' as const,
        rowVersion: 3,
      }),
    );
    const response = await app(repository({ update })).inject({
      method: 'PUT',
      url: `/api/v1/engagements/${engagement.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: input,
    });
    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(
      'valid',
      engagement.id,
      2,
      input,
      expect.any(String),
    );
  });

  it('transitions to active with an actual start date', async () => {
    const transitionStatus = vi.fn(() => Promise.resolve(engagement));
    const response = await app(repository({ transitionStatus })).inject({
      method: 'POST',
      url: `/api/v1/engagements/${engagement.id}/status`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: {
        status: 'active',
        reason: '開始確認済み',
        actualDate: '2026-09-01',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(transitionStatus).toHaveBeenCalledWith(
      'valid',
      engagement.id,
      2,
      { status: 'active', reason: '開始確認済み', actualDate: '2026-09-01' },
      expect.any(String),
    );
  });

  it('requires a reason when ending or cancelling', async () => {
    const response = await app().inject({
      method: 'POST',
      url: `/api/v1/engagements/${engagement.id}/status`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: { status: 'ended', reason: null, actualDate: '2027-02-28' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('requires If-Match for draft updates', async () => {
    const response = await app().inject({
      method: 'PUT',
      url: `/api/v1/engagements/${engagement.id}`,
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(response.statusCode).toBe(428);
  });
});
