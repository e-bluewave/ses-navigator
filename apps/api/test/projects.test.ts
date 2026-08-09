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
    list: vi.fn(() => Promise.resolve([project])),
    findById: vi.fn(() => Promise.resolve(project)),
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
