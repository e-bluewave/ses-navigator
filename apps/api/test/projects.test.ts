import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';
import type {
  Project,
  ProjectRepository,
} from '../src/modules/projects/project-repository.js';

const project: Project = {
  id: '11111111-1111-4111-8111-111111111111',
  managementNo: 'PJ-000001',
  projectName: '基幹システム刷新',
  summary: null,
  projectStatus: 'open',
  recruitmentStatus: 'recruiting',
  plannedStartOn: '2026-09-01',
  plannedEndOn: null,
  updatedAt: '2026-08-08T12:00:00Z',
  rowVersion: 2,
};
const authentication: AuthenticationService = {
  authenticate: (accessToken: string) =>
    Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () =>
  Promise.all(apps.splice(0).map(async (app) => app.close())),
);

function repository(
  overrides: Partial<ProjectRepository> = {},
): ProjectRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    canManage: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() => Promise.resolve({ items: [project], nextCursor: null })),
    findById: vi.fn(() => Promise.resolve(project)),
    create: vi.fn(() => Promise.resolve(project)),
    update: vi.fn(() => Promise.resolve(project)),
    ...overrides,
  };
}

function app(projects = repository()) {
  const instance = buildApp({ authentication, projects });
  apps.push(instance);
  return instance;
}

describe('project read API', () => {
  it('returns 401 without a bearer token', async () => {
    const response = await app().inject({
      method: 'GET',
      url: '/api/v1/projects',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('returns 403 without project.read', async () => {
    const response = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'forbidden' } });
  });

  it('lists RLS-visible projects', async () => {
    const response = await app().inject({
      method: 'GET',
      url: '/api/v1/projects?status=open&limit=20',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [project],
      page: { limit: 20, nextCursor: null },
    });
  });

  it('passes search, filters, and a cursor to the repository', async () => {
    const next = { updatedAt: project.updatedAt, id: project.id };
    const list = vi.fn(() =>
      Promise.resolve({ items: [project], nextCursor: next }),
    );
    const response = await app(repository({ list })).inject({
      method: 'GET',
      url: '/api/v1/projects?q=%E5%9F%BA%E5%B9%B9&status=open&recruitmentStatus=recruiting&limit=20',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith('valid', {
      limit: 20,
      query: '基幹',
      status: 'open',
      recruitmentStatus: 'recruiting',
    });
    const body = response.json<{ page: { nextCursor: string | null } }>();
    expect(body.page.nextCursor).toEqual(expect.any(String));
  });

  it('rejects an invalid cursor', async () => {
    const response = await app().inject({
      method: 'GET',
      url: '/api/v1/projects?cursor=invalid',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns a project detail', async () => {
    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/projects/${project.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(project);
  });

  it('returns 404 when RLS hides another tenant project', async () => {
    const response = await app(
      repository({ findById: vi.fn(() => Promise.resolve(null)) }),
    ).inject({
      method: 'GET',
      url: `/api/v1/projects/${project.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('rejects invalid filters', async () => {
    const response = await app().inject({
      method: 'GET',
      url: '/api/v1/projects?limit=201',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'invalid_request' },
    });
  });
});

describe('project write API', () => {
  const body = {
    managementNo: 'PJ-000001',
    projectName: '基幹システム刷新',
    summary: null,
    projectStatus: 'open',
    recruitmentStatus: 'recruiting',
    plannedStartOn: '2026-09-01',
    plannedEndOn: null,
  };

  it('creates a project with manage permission', async () => {
    const response = await app().inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: 'Bearer valid' },
      payload: body,
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers.etag).toBe('"2"');
  });

  it('updates with optimistic locking', async () => {
    const update = vi.fn(() => Promise.resolve(project));
    const response = await app(repository({ update })).inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith('valid', project.id, 2, body);
  });

  it('requires If-Match and reports conflicts', async () => {
    const missing = await app().inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}`,
      headers: { authorization: 'Bearer valid' },
      payload: body,
    });
    expect(missing.statusCode).toBe(428);
    const conflict = await app(
      repository({ update: vi.fn(() => Promise.resolve(null)) }),
    ).inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: body,
    });
    expect(conflict.statusCode).toBe(409);
  });
});
