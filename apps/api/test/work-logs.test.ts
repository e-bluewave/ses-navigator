import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  WorkLog,
  WorkLogInput,
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
  statusHistories: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      fromStatus: 'submitted',
      toStatus: 'approved',
      changeReason: '顧客承認済み',
      changedAt: '2026-09-03T00:00:00Z',
    },
  ],
  approval: {
    id: '66666666-6666-4666-8666-666666666666',
    status: 'approved',
    requestedAt: '2026-09-01T00:00:00Z',
    completedAt: '2026-09-03T00:00:00Z',
    requestNote: '確認をお願いします',
    decisionNote: '顧客承認済み',
  },
};

const input: WorkLogInput = {
  contractId: workLog.contractId,
  engineerId: workLog.engineerId,
  workMonth: workLog.workMonth,
  scheduledDays: 20,
  scheduledHours: 160,
  absenceHours: 0,
  notes: '月次実績',
  details: [
    {
      workDate: '2026-08-03',
      workType: 'work',
      startTime: '09:00',
      endTime: '18:00',
      breakMinutes: 60,
      workHours: 8,
      overtimeHours: 0,
      description: '設計・実装',
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
    canManage: vi.fn(() => Promise.resolve(true)),
    canApprove: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() => Promise.resolve({ items: [summary], nextCursor: null })),
    findById: vi.fn(() => Promise.resolve(workLog)),
    create: vi.fn(() =>
      Promise.resolve({ ...workLog, status: 'draft' as const }),
    ),
    update: vi.fn(() =>
      Promise.resolve({ ...workLog, status: 'draft' as const }),
    ),
    transitionStatus: vi.fn(() => Promise.resolve(workLog)),
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

describe('work log write and approval API', () => {
  it('creates a monthly work log draft with daily records', async () => {
    const create = vi.fn(() =>
      Promise.resolve({ ...workLog, status: 'draft' as const, rowVersion: 1 }),
    );
    const response = await app(repository({ create })).inject({
      method: 'POST',
      url: '/api/v1/work-logs',
      headers: { authorization: 'Bearer valid', 'x-request-id': 'request-1' },
      payload: input,
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers.etag).toBe('"1"');
    expect(create).toHaveBeenCalledWith('valid', input, 'request-1');
  });

  it('updates a rejected work log with optimistic locking', async () => {
    const update = vi.fn(() =>
      Promise.resolve({ ...workLog, status: 'rejected' as const }),
    );
    const response = await app(repository({ update })).inject({
      method: 'PUT',
      url: `/api/v1/work-logs/${workLog.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"3"' },
      payload: input,
    });
    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(
      'valid',
      workLog.id,
      3,
      input,
      expect.any(String),
    );
  });

  it('submits a work log with contract.manage', async () => {
    const transitionStatus = vi.fn(() =>
      Promise.resolve({ ...workLog, status: 'submitted' as const }),
    );
    const response = await app(repository({ transitionStatus })).inject({
      method: 'POST',
      url: `/api/v1/work-logs/${workLog.id}/status`,
      headers: { authorization: 'Bearer valid', 'if-match': '"3"' },
      payload: {
        status: 'submitted',
        reason: '承認をお願いします',
        approvedByName: null,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(transitionStatus).toHaveBeenCalledWith(
      'valid',
      workLog.id,
      3,
      {
        status: 'submitted',
        reason: '承認をお願いします',
        approvedByName: null,
      },
      expect.any(String),
    );
  });

  it('approves a submitted work log with contract.approve', async () => {
    const transitionStatus = vi.fn(() => Promise.resolve(workLog));
    const response = await app(repository({ transitionStatus })).inject({
      method: 'POST',
      url: `/api/v1/work-logs/${workLog.id}/status`,
      headers: { authorization: 'Bearer valid', 'if-match': '"3"' },
      payload: {
        status: 'approved',
        reason: '確認済み',
        approvedByName: '顧客担当者',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(transitionStatus).toHaveBeenCalledOnce();
  });

  it('requires contract.approve for an approval decision', async () => {
    const response = await app(
      repository({ canApprove: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/work-logs/${workLog.id}/status`,
      headers: { authorization: 'Bearer valid', 'if-match': '"3"' },
      payload: {
        status: 'rejected',
        reason: '修正してください',
        approvedByName: null,
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it.each([
    { ...input, workMonth: '2026-08-02' },
    { ...input, details: [{ ...input.details[0]!, workDate: '2026-09-01' }] },
    { ...input, details: [input.details[0]!, input.details[0]!] },
  ])('rejects invalid work log input', async (payload) => {
    const response = await app().inject({
      method: 'POST',
      url: '/api/v1/work-logs',
      headers: { authorization: 'Bearer valid' },
      payload,
    });
    expect(response.statusCode).toBe(400);
  });

  it('requires If-Match for update and transition', async () => {
    const update = await app().inject({
      method: 'PUT',
      url: `/api/v1/work-logs/${workLog.id}`,
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    const transition = await app().inject({
      method: 'POST',
      url: `/api/v1/work-logs/${workLog.id}/status`,
      headers: { authorization: 'Bearer valid' },
      payload: { status: 'submitted', reason: null, approvedByName: null },
    });
    expect(update.statusCode).toBe(428);
    expect(transition.statusCode).toBe(428);
  });
});
