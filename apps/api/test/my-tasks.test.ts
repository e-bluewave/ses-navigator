import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  MyTask,
  MyTaskUpdate,
  TaskRepository,
} from '../src/modules/tasks/task-repository.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';

const taskId = '11111111-1111-4111-8111-111111111111';
const task: MyTask = {
  id: taskId,
  title: '面談結果を確認する',
  description: '顧客へ結果を確認する',
  status: 'open',
  priority: 'high',
  dueAt: '2026-09-11T03:00:00Z',
  completedAt: null,
  isCompleted: false,
  isOverdue: false,
  isDueToday: true,
  isUpcoming: false,
  dueCategory: 'today',
  assignment: {
    assignmentType: 'owner',
    assignedAt: '2026-09-10T01:00:00Z',
  },
  links: [
    {
      resourceType: 'interview',
      resourceId: '22222222-2222-4222-8222-222222222222',
      linkType: 'related',
    },
  ],
  createdAt: '2026-09-10T01:00:00Z',
  updatedAt: '2026-09-10T01:00:00Z',
  rowVersion: 1,
};
const updated: MyTaskUpdate = {
  id: task.id,
  title: task.title,
  description: task.description,
  status: 'completed',
  priority: task.priority,
  dueAt: task.dueAt,
  completedAt: '2026-09-11T04:00:00Z',
  createdAt: task.createdAt,
  updatedAt: '2026-09-11T04:00:00Z',
  rowVersion: 2,
};
const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function repository(overrides: Partial<TaskRepository> = {}): TaskRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    canManage: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() => Promise.resolve([task])),
    update: vi.fn(() => Promise.resolve(updated)),
    ...overrides,
  };
}

function app(tasks = repository()) {
  const instance = buildApp({ authentication, tasks });
  apps.push(instance);
  return instance;
}

describe('My Tasks API', () => {
  it('rejects unauthenticated requests', async () => {
    const instance = buildApp({
      authentication: {
        authenticate: () => Promise.reject(new Error('invalid token')),
      },
      tasks: repository(),
    });
    apps.push(instance);

    const response = await instance.inject({
      method: 'GET',
      url: '/api/v1/my-tasks',
    });

    expect(response.statusCode).toBe(401);
  });

  it('lists directly assigned tasks with scope, time zone, and limit', async () => {
    const list = vi.fn(() => Promise.resolve([task]));
    const response = await app(repository({ list })).inject({
      method: 'GET',
      url: '/api/v1/my-tasks?scope=today&timeZone=Asia%2FTokyo&limit=20',
      headers: { authorization: 'Bearer valid' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [task] });
    expect(list).toHaveBeenCalledWith('valid', {
      scope: 'today',
      timeZone: 'Asia/Tokyo',
      limit: 20,
    });
  });

  it('defaults to incomplete tasks in the Tokyo time zone', async () => {
    const list = vi.fn(() => Promise.resolve([]));
    const response = await app(repository({ list })).inject({
      method: 'GET',
      url: '/api/v1/my-tasks',
      headers: { authorization: 'Bearer valid' },
    });

    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith('valid', {
      scope: 'incomplete',
      timeZone: 'Asia/Tokyo',
      limit: 100,
    });
  });

  it('completes a task with optimistic locking', async () => {
    const update = vi.fn(() => Promise.resolve(updated));
    const response = await app(repository({ update })).inject({
      method: 'PATCH',
      url: `/api/v1/my-tasks/${taskId}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: { status: 'completed', reason: '対応完了' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).toBe('"2"');
    expect(update).toHaveBeenCalledWith('valid', taskId, 1, {
      status: 'completed',
      reason: '対応完了',
    });
  });

  it('changes or clears a due date', async () => {
    const update = vi.fn(() => Promise.resolve(updated));
    const instance = app(repository({ update }));
    const changed = await instance.inject({
      method: 'PATCH',
      url: `/api/v1/my-tasks/${taskId}`,
      headers: { authorization: 'Bearer valid', 'if-match': '1' },
      payload: { dueAt: '2026-09-12T03:00:00+09:00' },
    });
    const cleared = await instance.inject({
      method: 'PATCH',
      url: `/api/v1/my-tasks/${taskId}`,
      headers: { authorization: 'Bearer valid', 'if-match': '1' },
      payload: { clearDueAt: true },
    });

    expect(changed.statusCode).toBe(200);
    expect(cleared.statusCode).toBe(200);
    expect(update).toHaveBeenNthCalledWith(1, 'valid', taskId, 1, {
      dueAt: '2026-09-12T03:00:00+09:00',
    });
    expect(update).toHaveBeenNthCalledWith(2, 'valid', taskId, 1, {
      clearDueAt: true,
    });
  });

  it('fails closed for permissions, invalid input, and stale tasks', async () => {
    const forbidden = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: '/api/v1/my-tasks',
      headers: { authorization: 'Bearer valid' },
    });
    expect(forbidden.statusCode).toBe(403);

    const invalidTimeZone = await app().inject({
      method: 'GET',
      url: '/api/v1/my-tasks?timeZone=not-a-time-zone',
      headers: { authorization: 'Bearer valid' },
    });
    expect(invalidTimeZone.statusCode).toBe(400);

    const manageForbidden = await app(
      repository({ canManage: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'PATCH',
      url: `/api/v1/my-tasks/${taskId}`,
      headers: { authorization: 'Bearer valid', 'if-match': '1' },
      payload: { status: 'completed' },
    });
    expect(manageForbidden.statusCode).toBe(403);

    const missingVersion = await app().inject({
      method: 'PATCH',
      url: `/api/v1/my-tasks/${taskId}`,
      headers: { authorization: 'Bearer valid' },
      payload: { status: 'completed' },
    });
    expect(missingVersion.statusCode).toBe(428);

    const invalidId = await app().inject({
      method: 'PATCH',
      url: '/api/v1/my-tasks/not-a-uuid',
      headers: { authorization: 'Bearer valid', 'if-match': '1' },
      payload: { status: 'completed' },
    });
    expect(invalidId.statusCode).toBe(400);

    const invalid = await app().inject({
      method: 'PATCH',
      url: `/api/v1/my-tasks/${taskId}`,
      headers: { authorization: 'Bearer valid', 'if-match': '1' },
      payload: { dueAt: null },
    });
    expect(invalid.statusCode).toBe(400);

    const conflict = await app(
      repository({ update: vi.fn(() => Promise.resolve(null)) }),
    ).inject({
      method: 'PATCH',
      url: `/api/v1/my-tasks/${taskId}`,
      headers: { authorization: 'Bearer valid', 'if-match': '1' },
      payload: { status: 'completed' },
    });
    expect(conflict.statusCode).toBe(409);
  });
});
