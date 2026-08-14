import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  AccountingPeriod,
  AccountingPeriodRepository,
} from '../src/modules/accounting-periods/accounting-period-repository.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';

const period: AccountingPeriod = {
  id: '11111111-1111-4111-8111-111111111111',
  periodMonth: '2026-08-01',
  salesStatus: 'open',
  invoiceStatus: 'open',
  paymentStatus: 'open',
  salesClosedAt: null,
  invoiceClosedAt: null,
  paymentClosedAt: null,
  updatedAt: '2026-08-14T00:00:00Z',
  rowVersion: 1,
  statusHistories: [],
};
const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function repository(
  overrides: Partial<AccountingPeriodRepository> = {},
): AccountingPeriodRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    canManage: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() => Promise.resolve([period])),
    findById: vi.fn(() => Promise.resolve(period)),
    create: vi.fn(() => Promise.resolve(period)),
    transitionStatus: vi.fn(() => Promise.resolve(period)),
    ...overrides,
  };
}

function app(accountingPeriods = repository()) {
  const instance = buildApp({ authentication, accountingPeriods });
  apps.push(instance);
  return instance;
}

describe('accounting period API', () => {
  it('lists accounting periods with month filters', async () => {
    const list = vi.fn(() => Promise.resolve([period]));
    const response = await app(repository({ list })).inject({
      method: 'GET',
      url: '/api/v1/accounting-periods?fromMonth=2026-01-01&toMonth=2026-12-01&limit=12',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [period] });
    expect(list).toHaveBeenCalledWith('valid', {
      fromMonth: '2026-01-01',
      toMonth: '2026-12-01',
      limit: 12,
    });
  });

  it('creates a first-of-month accounting period', async () => {
    const create = vi.fn(() => Promise.resolve(period));
    const response = await app(repository({ create })).inject({
      method: 'POST',
      url: '/api/v1/accounting-periods',
      headers: { authorization: 'Bearer valid' },
      payload: { periodMonth: '2026-08-01' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers.etag).toBe('"1"');
    expect(create).toHaveBeenCalledWith(
      'valid',
      '2026-08-01',
      expect.any(String),
    );
  });

  it('closes a stage with optimistic locking', async () => {
    const transitionStatus = vi.fn(() =>
      Promise.resolve({
        ...period,
        salesStatus: 'closed' as const,
        salesClosedAt: '2026-08-14T01:00:00Z',
        rowVersion: 2,
      }),
    );
    const response = await app(repository({ transitionStatus })).inject({
      method: 'POST',
      url: `/api/v1/accounting-periods/${period.id}/status`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: {
        closeType: 'sales',
        status: 'closed',
        reason: null,
        impactConfirmed: false,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(transitionStatus).toHaveBeenCalledWith(
      'valid',
      period.id,
      1,
      {
        closeType: 'sales',
        status: 'closed',
        reason: null,
        impactConfirmed: false,
      },
      expect.any(String),
    );
  });

  it('requires reason and impact confirmation to reopen', async () => {
    const response = await app().inject({
      method: 'POST',
      url: `/api/v1/accounting-periods/${period.id}/status`,
      headers: { authorization: 'Bearer valid', 'if-match': '1' },
      payload: {
        closeType: 'sales',
        status: 'open',
        reason: null,
        impactConfirmed: false,
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('validates permissions, month ranges, and If-Match', async () => {
    const forbidden = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: '/api/v1/accounting-periods',
      headers: { authorization: 'Bearer valid' },
    });
    expect(forbidden.statusCode).toBe(403);

    const invalidMonth = await app().inject({
      method: 'POST',
      url: '/api/v1/accounting-periods',
      headers: { authorization: 'Bearer valid' },
      payload: { periodMonth: '2026-08-02' },
    });
    expect(invalidMonth.statusCode).toBe(400);

    const missingVersion = await app().inject({
      method: 'POST',
      url: `/api/v1/accounting-periods/${period.id}/status`,
      headers: { authorization: 'Bearer valid' },
      payload: {
        closeType: 'sales',
        status: 'closed',
        reason: null,
        impactConfirmed: false,
      },
    });
    expect(missingVersion.statusCode).toBe(428);
  });
});
