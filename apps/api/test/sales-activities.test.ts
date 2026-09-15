import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  SalesActivity,
  SalesActivityCreateResult,
  SalesActivityRepository,
} from '../src/modules/sales-activities/sales-activity-repository.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';

const companyId = '11111111-1111-4111-8111-111111111111';
const activityId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const nextId = '44444444-4444-4444-8444-444444444444';

const activity: SalesActivity = {
  id: activityId,
  companyId,
  activityType: 'call',
  direction: 'outbound',
  occurredAt: '2026-09-15T05:30:00Z',
  subject: '案件状況確認',
  summary: '先方へ案件の進捗を確認した',
  result: '9/18に再連絡',
  contact: null,
  project: null,
  engineer: null,
  followUpTask: {
    id: taskId,
    title: '顧客へ状況確認',
    status: 'open',
    priority: 'high',
    dueAt: '2026-09-18T01:00:00Z',
    completedAt: null,
    rowVersion: 1,
  },
  createdAt: '2026-09-15T05:31:00Z',
  updatedAt: '2026-09-15T05:31:00Z',
  rowVersion: 1,
};

const created: SalesActivityCreateResult = {
  activity: {
    id: activity.id,
    companyId: activity.companyId,
    activityType: activity.activityType,
    direction: activity.direction,
    occurredAt: activity.occurredAt,
    subject: activity.subject,
    summary: activity.summary,
    result: activity.result,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
    rowVersion: activity.rowVersion,
  },
  followUpTask: activity.followUpTask
    ? { ...activity.followUpTask, description: '社内確認後に再連絡する' }
    : null,
};

const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function repository(
  overrides: Partial<SalesActivityRepository> = {},
): SalesActivityRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    canManage: vi.fn(() => Promise.resolve(true)),
    canManageTasks: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() =>
      Promise.resolve({
        items: [activity],
        nextCursor: { occurredAt: activity.occurredAt, id: nextId },
      }),
    ),
    create: vi.fn(() => Promise.resolve(created)),
    ...overrides,
  };
}

function app(salesActivities = repository()) {
  const instance = buildApp({ authentication, salesActivities });
  apps.push(instance);
  return instance;
}

describe('Sales Activities API', () => {
  it('rejects unauthenticated requests', async () => {
    const instance = buildApp({
      authentication: {
        authenticate: () => Promise.reject(new Error('invalid token')),
      },
      salesActivities: repository(),
    });
    apps.push(instance);

    const response = await instance.inject({
      method: 'GET',
      url: `/api/v1/companies/${companyId}/sales-activities`,
    });

    expect(response.statusCode).toBe(401);
  });

  it('lists a company timeline with cursor pagination', async () => {
    const list = vi.fn(() =>
      Promise.resolve({
        items: [activity],
        nextCursor: { occurredAt: activity.occurredAt, id: nextId },
      }),
    );
    const response = await app(repository({ list })).inject({
      method: 'GET',
      url: `/api/v1/companies/${companyId}/sales-activities?limit=20`,
      headers: { authorization: 'Bearer valid' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toEqual([activity]);
    expect(body.page.limit).toBe(20);
    expect(body.page.nextCursor).toEqual(expect.any(String));
    expect(list).toHaveBeenCalledWith('valid', companyId, { limit: 20 });
  });

  it('decodes the sales activity cursor before repository access', async () => {
    const list = vi.fn(() => Promise.resolve({ items: [], nextCursor: null }));
    const cursor = Buffer.from(
      JSON.stringify({ occurredAt: activity.occurredAt, id: activityId }),
    ).toString('base64url');

    const response = await app(repository({ list })).inject({
      method: 'GET',
      url: `/api/v1/companies/${companyId}/sales-activities?cursor=${cursor}`,
      headers: { authorization: 'Bearer valid' },
    });

    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith('valid', companyId, {
      limit: 50,
      cursor: { occurredAt: activity.occurredAt, id: activityId },
    });
  });

  it('creates an activity without a follow-up task', async () => {
    const create = vi.fn(() =>
      Promise.resolve({ ...created, followUpTask: null }),
    );
    const response = await app(repository({ create })).inject({
      method: 'POST',
      url: `/api/v1/companies/${companyId}/sales-activities`,
      headers: {
        authorization: 'Bearer valid',
        'x-request-id': 'sales-activity-request-1',
      },
      payload: {
        activityType: 'email',
        direction: 'outbound',
        occurredAt: '2026-09-15T14:30:00+09:00',
        subject: '提案送付',
        summary: '提案資料を送付した',
        result: null,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith(
      'valid',
      companyId,
      {
        activityType: 'email',
        direction: 'outbound',
        occurredAt: '2026-09-15T14:30:00+09:00',
        subject: '提案送付',
        summary: '提案資料を送付した',
        result: null,
        companyContactId: null,
        projectId: null,
        engineerId: null,
        followUp: null,
      },
      'sales-activity-request-1',
    );
  });

  it('creates a follow-up task and defaults its priority to normal', async () => {
    const create = vi.fn(() => Promise.resolve(created));
    const response = await app(repository({ create })).inject({
      method: 'POST',
      url: `/api/v1/companies/${companyId}/sales-activities`,
      headers: {
        authorization: 'Bearer valid',
        'x-request-id': 'sales-activity-request-2',
      },
      payload: {
        activityType: 'call',
        occurredAt: '2026-09-15T14:30:00+09:00',
        subject: '案件状況確認',
        summary: '進捗を確認した',
        followUp: {
          title: '顧客へ再連絡',
          dueAt: '2026-09-18T10:00:00+09:00',
          description: '社内確認後に再連絡する',
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith(
      'valid',
      companyId,
      expect.objectContaining({
        followUp: {
          title: '顧客へ再連絡',
          dueAt: '2026-09-18T10:00:00+09:00',
          description: '社内確認後に再連絡する',
          priority: 'normal',
        },
      }),
      'sales-activity-request-2',
    );
  });

  it('enforces company.read, company.manage, and task.manage', async () => {
    const readForbidden = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: `/api/v1/companies/${companyId}/sales-activities`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(readForbidden.statusCode).toBe(403);

    const manageForbidden = await app(
      repository({ canManage: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/companies/${companyId}/sales-activities`,
      headers: { authorization: 'Bearer valid' },
      payload: {
        activityType: 'call',
        occurredAt: '2026-09-15T14:30:00+09:00',
        subject: '確認',
        summary: '確認した',
      },
    });
    expect(manageForbidden.statusCode).toBe(403);

    const taskForbidden = await app(
      repository({ canManageTasks: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/companies/${companyId}/sales-activities`,
      headers: { authorization: 'Bearer valid' },
      payload: {
        activityType: 'call',
        occurredAt: '2026-09-15T14:30:00+09:00',
        subject: '確認',
        summary: '確認した',
        followUp: {
          title: '再連絡',
          dueAt: '2026-09-18T10:00:00+09:00',
        },
      },
    });
    expect(taskForbidden.statusCode).toBe(403);
  });

  it('fails closed for invalid ids, cursors, enums, and datetimes', async () => {
    const invalidId = await app().inject({
      method: 'GET',
      url: '/api/v1/companies/not-a-uuid/sales-activities',
      headers: { authorization: 'Bearer valid' },
    });
    expect(invalidId.statusCode).toBe(400);

    const invalidCursor = await app().inject({
      method: 'GET',
      url: `/api/v1/companies/${companyId}/sales-activities?cursor=not-base64-json`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(invalidCursor.statusCode).toBe(400);

    const invalidActivity = await app().inject({
      method: 'POST',
      url: `/api/v1/companies/${companyId}/sales-activities`,
      headers: { authorization: 'Bearer valid' },
      payload: {
        activityType: 'invalid',
        occurredAt: '2026-09-15T14:30:00+09:00',
        subject: '確認',
        summary: '確認した',
      },
    });
    expect(invalidActivity.statusCode).toBe(400);

    const localDateTimeWithoutOffset = await app().inject({
      method: 'POST',
      url: `/api/v1/companies/${companyId}/sales-activities`,
      headers: { authorization: 'Bearer valid' },
      payload: {
        activityType: 'call',
        occurredAt: '2026-09-15T14:30:00',
        subject: '確認',
        summary: '確認した',
      },
    });
    expect(localDateTimeWithoutOffset.statusCode).toBe(400);
  });
});
