import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  WorkLog,
  WorkLogRepository,
  WorkLogSummary,
} from '../src/modules/work-logs/work-log-repository.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';

const summary: WorkLogSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  contractId: '22222222-2222-4222-8222-222222222222',
  engineerId: '33333333-3333-4333-8333-333333333333',
  contractTitle: '基幹システム刷新 SES契約',
  engineerName: '山田 太郎',
  workMonth: '2026-08-01',
  status: 'approved',
  scheduledDays: 20,
  actualDays: 19,
  scheduledHours: 160,
  actualHours: 156,
  overtimeHours: 8,
  absenceHours: 8,
  customerApprovedAt: '2026-09-03T00:00:00Z',
  updatedAt: '2026-09-03T01:00:00Z',
  rowVersion: 3,
};

const workLog: WorkLog = {
  ...summary,
  approvedByName: '顧客担当者',
  notes: '承認済み',
  details: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      workDate: '2026-08-03',
      workType: 'work',
      startTime: '09:00:00',
      endTime: '18:00:00',
      breakMinutes: 60,
      workHours: 8,
      overtimeHours: 0,
      description: '設計・実装',
      updatedAt: '2026-08-03T10:00:00Z',
      rowVersion: 1,
    },
  ],
};

const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function repository(
  overrides: Partial<WorkLogRepository> = {},
): WorkLogRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() => Promise.resolve({ items: [summary], nextCursor: null })),
    findById: vi.fn(() => Promise.resolve(workLog)),
    ...overrides,
  };
}

function app(workLogs = repository()) {
  const instance = buildApp({ authentication, workLogs });
  apps.push(instance);
  return instance;
}

describe('work log read API', () => {
  it('lists authorized monthly summaries with filters', async () => {
    const list = vi.fn(() =>
      Promise.resolve({ items: [summary], nextCursor: null }),
    );
    const response = await app(repository({ list })).inject({
      method: 'GET',
      url: '/api/v1/work-logs?q=山田&status=approved&workMonth=2026-08-01&limit=20',
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
      status: 'approved',
      workMonth: '2026-08-01',
    });
  });

  it('requires contract.read', async () => {
    const response = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: '/api/v1/work-logs',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('encodes and accepts the compound cursor', async () => {
    const next = {
      workMonth: summary.workMonth,
      updatedAt: summary.updatedAt,
      id: summary.id,
    };
    const list = vi.fn(() =>
      Promise.resolve({ items: [summary], nextCursor: next }),
    );
    const first = await app(repository({ list })).inject({
      method: 'GET',
      url: '/api/v1/work-logs?limit=1',
      headers: { authorization: 'Bearer valid' },
    });
    const cursor = first.json<{ page: { nextCursor: string } }>().page
      .nextCursor;
    const second = await app(repository({ list })).inject({
      method: 'GET',
      url: `/api/v1/work-logs?limit=1&cursor=${encodeURIComponent(cursor)}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(second.statusCode).toBe(200);
    expect(list).toHaveBeenLastCalledWith('valid', { limit: 1, cursor: next });
  });

  it('returns detail with daily records', async () => {
    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/work-logs/${workLog.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(workLog);
  });

  it('normalizes an inaccessible work log to 404', async () => {
    const response = await app(
      repository({ findById: vi.fn(() => Promise.resolve(null)) }),
    ).inject({
      method: 'GET',
      url: `/api/v1/work-logs/${workLog.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(404);
  });

  it.each([
    '/api/v1/work-logs?status=unknown',
    '/api/v1/work-logs?workMonth=2026-08-02',
    '/api/v1/work-logs?cursor=invalid',
    '/api/v1/work-logs?limit=0',
  ])('rejects invalid list query %s', async (url) => {
    const response = await app().inject({
      method: 'GET',
      url,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(400);
  });
});
