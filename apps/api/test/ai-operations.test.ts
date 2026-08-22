import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  AiBudgetPolicy,
  AiOperationsDashboard,
  AiOperationsRepository,
} from '../src/modules/ai-operations/ai-operations-repository.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';

const dashboard: AiOperationsDashboard = {
  fromDate: '2026-08-01',
  toDate: '2026-08-22',
  executionCount: 12,
  succeededCount: 10,
  failedCount: 1,
  activeCount: 0,
  reviewRequiredCount: 1,
  successRate: 83.33,
  inputTokens: 12000,
  outputTokens: 3000,
  totalTokens: 15000,
  tokenRecordedCount: 11,
  costRecordedCount: 8,
  costCoverageRate: 66.67,
  averageLatencyMs: 2500,
  p95LatencyMs: 5000,
  pendingReviewCount: 1,
  reviewedCount: 9,
  approvedCount: 7,
  partiallyApprovedCount: 1,
  rejectedCount: 1,
  changesRequestedCount: 0,
  approvalRate: 88.89,
  feedbackCount: 2,
  averageRating: 4.5,
  issueFeedbackCount: 1,
  unsafeFeedbackCount: 0,
  daily: [],
  typeUsage: [],
  modelUsage: [],
  costByCurrency: [],
  recentFailures: [],
};

const budget: AiBudgetPolicy = {
  canManage: true,
  configured: true,
  enabled: true,
  currency: 'USD',
  dailyWarningAmount: 1,
  dailyStopAmount: 2,
  monthlyWarningAmount: 20,
  monthlyStopAmount: 30,
  dailyWarningExecutions: 50,
  dailyStopExecutions: 100,
  monthlyWarningExecutions: 1000,
  monthlyStopExecutions: 2000,
  dailyExecutionCount: 12,
  monthlyExecutionCount: 240,
  dailyEstimatedCost: 0.25,
  monthlyEstimatedCost: 5.5,
  dailyCostRecordedCount: 10,
  monthlyCostRecordedCount: 220,
  warningReached: false,
  stopReached: false,
  stopReasons: [],
  rowVersion: 3,
  updatedAt: '2026-08-22T06:00:00Z',
};

const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function repository(
  overrides: Partial<AiOperationsRepository> = {},
): AiOperationsRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    canManage: vi.fn(() => Promise.resolve(true)),
    get: vi.fn(() => Promise.resolve(dashboard)),
    getBudget: vi.fn(() => Promise.resolve(budget)),
    saveBudget: vi.fn(() => Promise.resolve(budget)),
    ...overrides,
  };
}

function app(aiOperations = repository()) {
  const instance = buildApp({ authentication, aiOperations });
  apps.push(instance);
  return instance;
}

describe('AI operations API', () => {
  it('returns the tenant-scoped dashboard', async () => {
    const get = vi.fn(() => Promise.resolve(dashboard));
    const response = await app(repository({ get })).inject({
      method: 'GET',
      url: '/api/v1/ai-operations?fromDate=2026-08-01&toDate=2026-08-22',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(dashboard);
    expect(get).toHaveBeenCalledWith('valid', '2026-08-01', '2026-08-22');
  });

  it('rejects users without ai.read and invalid ranges', async () => {
    const forbidden = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: '/api/v1/ai-operations?fromDate=2026-08-01&toDate=2026-08-22',
      headers: { authorization: 'Bearer valid' },
    });
    expect(forbidden.statusCode).toBe(403);

    const invalid = await app().inject({
      method: 'GET',
      url: '/api/v1/ai-operations?fromDate=2026-08-22&toDate=2026-08-01',
      headers: { authorization: 'Bearer valid' },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('reads and saves an optimistic-locked AI budget policy', async () => {
    const getBudget = vi.fn(() => Promise.resolve(budget));
    const saveBudget = vi.fn(() => Promise.resolve(budget));
    const instance = app(repository({ getBudget, saveBudget }));
    const read = await instance.inject({
      method: 'GET',
      url: '/api/v1/ai-operations/budget',
      headers: { authorization: 'Bearer valid' },
    });
    expect(read.statusCode).toBe(200);
    expect(read.headers.etag).toBe('W/"3"');
    expect(read.json()).toEqual(budget);

    const input = {
      enabled: true,
      currency: 'USD',
      dailyWarningAmount: 1,
      dailyStopAmount: 2,
      monthlyWarningAmount: 20,
      monthlyStopAmount: 30,
      dailyWarningExecutions: 50,
      dailyStopExecutions: 100,
      monthlyWarningExecutions: 1000,
      monthlyStopExecutions: 2000,
    };
    const save = await instance.inject({
      method: 'PUT',
      url: '/api/v1/ai-operations/budget',
      headers: { authorization: 'Bearer valid', 'if-match': 'W/"3"' },
      payload: input,
    });
    expect(save.statusCode).toBe(200);
    expect(saveBudget).toHaveBeenCalledWith(
      'valid',
      3,
      input,
      expect.any(String),
    );
  });

  it('protects budget changes with permission, validation, and conflict checks', async () => {
    const forbidden = await app(
      repository({ canManage: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'PUT',
      url: '/api/v1/ai-operations/budget',
      headers: { authorization: 'Bearer valid', 'if-match': 'W/"0"' },
      payload: { enabled: false, currency: 'USD' },
    });
    expect(forbidden.statusCode).toBe(403);

    const invalid = await app().inject({
      method: 'PUT',
      url: '/api/v1/ai-operations/budget',
      headers: { authorization: 'Bearer valid', 'if-match': 'W/"0"' },
      payload: {
        enabled: true,
        currency: 'USD',
        dailyWarningAmount: 3,
        dailyStopAmount: 2,
      },
    });
    expect(invalid.statusCode).toBe(400);

    const conflict = await app(
      repository({ saveBudget: vi.fn(() => Promise.resolve(null)) }),
    ).inject({
      method: 'PUT',
      url: '/api/v1/ai-operations/budget',
      headers: { authorization: 'Bearer valid', 'if-match': 'W/"2"' },
      payload: { enabled: false, currency: 'USD' },
    });
    expect(conflict.statusCode).toBe(409);
  });
});
