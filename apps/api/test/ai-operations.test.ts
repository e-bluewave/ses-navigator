import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
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
    get: vi.fn(() => Promise.resolve(dashboard)),
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
});
