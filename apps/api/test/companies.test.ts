import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';
import type {
  Company,
  CompanyRepository,
} from '../src/modules/companies/company-repository.js';

const company: Company = {
  id: '22222222-2222-4222-8222-222222222222',
  managementNo: 'CO-000001',
  legalName: '青波株式会社',
  displayName: '青波',
  corporateNumber: '1234567890123',
  postalCode: '100-0001',
  prefecture: '東京都',
  city: '千代田区',
  addressLine: '千代田1-1',
  websiteUrl: 'https://example.com',
  representativeName: '青波 太郎',
  status: 'active',
  updatedAt: '2026-08-09T00:00:00Z',
  rowVersion: 1,
};
const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function repository(
  overrides: Partial<CompanyRepository> = {},
): CompanyRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    canManage: vi.fn(() => Promise.resolve(true)),
    canReadAudit: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() => Promise.resolve({ items: [company], nextCursor: null })),
    findById: vi.fn(() => Promise.resolve(company)),
    create: vi.fn(() => Promise.resolve(company)),
    update: vi.fn(() => Promise.resolve(company)),
    softDelete: vi.fn(() => Promise.resolve(true)),
    listAudit: vi.fn(() => Promise.resolve([])),
    ...overrides,
  };
}
function app(companies = repository()) {
  const instance = buildApp({ authentication, companies });
  apps.push(instance);
  return instance;
}

describe('company read API', () => {
  it('requires authentication and company.read', async () => {
    expect(
      (await app().inject({ method: 'GET', url: '/api/v1/companies' }))
        .statusCode,
    ).toBe(401);
    const forbidden = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: '/api/v1/companies',
      headers: { authorization: 'Bearer valid' },
    });
    expect(forbidden.statusCode).toBe(403);
  });
  it('lists RLS-visible companies with filters', async () => {
    const list = vi.fn(() =>
      Promise.resolve({
        items: [company],
        nextCursor: { updatedAt: company.updatedAt, id: company.id },
      }),
    );
    const response = await app(repository({ list })).inject({
      method: 'GET',
      url: '/api/v1/companies?q=%E9%9D%92%E6%B3%A2&status=active&limit=20',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith('valid', {
      limit: 20,
      query: '青波',
      status: 'active',
    });
    const body = response.json<{ page: { nextCursor: string | null } }>();
    expect(body).toMatchObject({
      items: [company],
      page: { limit: 20 },
    });
    expect(body.page.nextCursor).toEqual(expect.any(String));
  });
  it('returns detail and hides inaccessible records as 404', async () => {
    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/companies/${company.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.json()).toEqual(company);
    const hidden = await app(
      repository({ findById: vi.fn(() => Promise.resolve(null)) }),
    ).inject({
      method: 'GET',
      url: `/api/v1/companies/${company.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(hidden.statusCode).toBe(404);
  });
  it('rejects invalid filters, cursors, and ids', async () => {
    expect(
      (
        await app().inject({
          method: 'GET',
          url: '/api/v1/companies?status=unknown',
          headers: { authorization: 'Bearer valid' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app().inject({
          method: 'GET',
          url: '/api/v1/companies?cursor=bad',
          headers: { authorization: 'Bearer valid' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app().inject({
          method: 'GET',
          url: '/api/v1/companies/not-a-uuid',
          headers: { authorization: 'Bearer valid' },
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe('company write API', () => {
  const body = {
    managementNo: 'CO-000001',
    legalName: '青波株式会社',
    displayName: '青波',
    corporateNumber: '1234567890123',
    postalCode: '100-0001',
    prefecture: '東京都',
    city: '千代田区',
    addressLine: '千代田1-1',
    websiteUrl: 'https://example.com',
    representativeName: '青波 太郎',
    status: 'active',
  };

  it('creates with company.manage and returns an ETag', async () => {
    const response = await app().inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: 'Bearer valid' },
      payload: body,
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers.etag).toBe('"1"');
  });

  it('updates with optimistic locking', async () => {
    const update = vi.fn(() => Promise.resolve(company));
    const response = await app(repository({ update })).inject({
      method: 'PUT',
      url: `/api/v1/companies/${company.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith('valid', company.id, 1, body);
  });

  it('requires manage permission and If-Match, and reports conflicts', async () => {
    const forbidden = await app(
      repository({ canManage: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: 'Bearer valid' },
      payload: body,
    });
    expect(forbidden.statusCode).toBe(403);
    const missing = await app().inject({
      method: 'PUT',
      url: `/api/v1/companies/${company.id}`,
      headers: { authorization: 'Bearer valid' },
      payload: body,
    });
    expect(missing.statusCode).toBe(428);
    const conflict = await app(
      repository({ update: vi.fn(() => Promise.resolve(null)) }),
    ).inject({
      method: 'PUT',
      url: `/api/v1/companies/${company.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: body,
    });
    expect(conflict.statusCode).toBe(409);
  });

  it('rejects invalid corporate numbers and URLs', async () => {
    const invalidCorporate = await app().inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: 'Bearer valid' },
      payload: { ...body, corporateNumber: '123' },
    });
    expect(invalidCorporate.statusCode).toBe(400);
    const invalidUrl = await app().inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: 'Bearer valid' },
      payload: { ...body, websiteUrl: 'javascript:alert(1)' },
    });
    expect(invalidUrl.statusCode).toBe(400);
  });

  it('soft-deletes with a reason and exposes audit to audit.read', async () => {
    const softDelete = vi.fn(() => Promise.resolve(true));
    const response = await app(repository({ softDelete })).inject({
      method: 'DELETE',
      url: `/api/v1/companies/${company.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: { reason: '重複登録のため' },
    });
    expect(response.statusCode).toBe(204);
    expect(softDelete).toHaveBeenCalledWith(
      'valid',
      company.id,
      1,
      '重複登録のため',
      expect.any(String),
    );
    const audit = await app().inject({
      method: 'GET',
      url: `/api/v1/companies/${company.id}/audit`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(audit.statusCode).toBe(200);
  });

  it('rejects invalid deletion and audit access', async () => {
    const invalid = await app().inject({
      method: 'DELETE',
      url: `/api/v1/companies/${company.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: { reason: ' ' },
    });
    expect(invalid.statusCode).toBe(400);
    const conflict = await app(
      repository({ softDelete: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'DELETE',
      url: `/api/v1/companies/${company.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: { reason: '重複' },
    });
    expect(conflict.statusCode).toBe(409);
    const forbidden = await app(
      repository({ canReadAudit: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: `/api/v1/companies/${company.id}/audit`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});
