import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { EngineerRepository } from '../src/modules/engineers/engineer-repository.js';

const engineer = {
  id: '11111111-1111-4111-8111-111111111111',
  managementNo: 'EN-000001',
  familyName: '青波',
  givenName: '太郎',
  displayName: '青波 太郎',
  status: 'active' as const,
  availabilityStatus: 'available' as const,
  availableFrom: '2026-09-01',
  nearestStation: '東京',
  summary: 'TypeScriptエンジニア',
  updatedAt: '2026-08-09T00:00:00Z',
  rowVersion: 1,
};
function repository(
  overrides: Partial<EngineerRepository> = {},
): EngineerRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() => Promise.resolve({ items: [engineer], nextCursor: null })),
    findById: vi.fn(() => Promise.resolve(engineer)),
    ...overrides,
  };
}
const apps: ReturnType<typeof buildApp>[] = [];
function app(engineers = repository()) {
  const value = buildApp({
    authentication: {
      authenticate: vi.fn(() =>
        Promise.resolve({ id: 'user-1', accessToken: 'valid' }),
      ),
    },
    engineers,
  });
  apps.push(value);
  return value;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((value) => value.close()));
});

describe('engineer read API', () => {
  it('lists and reads RLS-visible public engineer data', async () => {
    const listEngineers = vi.fn(() =>
      Promise.resolve({ items: [engineer], nextCursor: null }),
    );
    const engineers = repository({ list: listEngineers });
    const list = await app(engineers).inject({
      method: 'GET',
      url: '/api/v1/engineers?q=青波&status=active&availabilityStatus=available',
      headers: { authorization: 'Bearer valid' },
    });
    expect(list.statusCode).toBe(200);
    expect(
      list.json<{ items: (typeof engineer)[] }>().items[0]?.managementNo,
    ).toBe('EN-000001');
    expect(listEngineers).toHaveBeenCalledWith(
      'valid',
      expect.objectContaining({
        q: '青波',
        status: 'active',
        availabilityStatus: 'available',
      }),
    );
    const detail = await app(engineers).inject({
      method: 'GET',
      url: `/api/v1/engineers/${engineer.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).not.toHaveProperty('primaryOwnerUserId');
    expect(detail.json()).not.toHaveProperty('nameNormalized');
  });
  it('enforces engineer.read and validates filters', async () => {
    expect(
      (
        await app(
          repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
        ).inject({
          method: 'GET',
          url: '/api/v1/engineers',
          headers: { authorization: 'Bearer valid' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app().inject({
          method: 'GET',
          url: '/api/v1/engineers?status=bad',
          headers: { authorization: 'Bearer valid' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app(
          repository({ findById: vi.fn(() => Promise.resolve(null)) }),
        ).inject({
          method: 'GET',
          url: `/api/v1/engineers/${engineer.id}`,
          headers: { authorization: 'Bearer valid' },
        })
      ).statusCode,
    ).toBe(404);
  });
});
