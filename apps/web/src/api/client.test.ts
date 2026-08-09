import { describe, expect, it, vi } from 'vitest';

import { ApiClientError, createProjectsApi } from './client.js';

describe('generated projects API client', () => {
  it('sends company create and versioned update requests', async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'company-1' }), { status: 200 }),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    const input = {
      managementNo: 'CO-000001',
      legalName: '青波株式会社',
      displayName: null,
      corporateNumber: null,
      postalCode: null,
      prefecture: null,
      city: null,
      addressLine: null,
      websiteUrl: null,
      representativeName: null,
      status: 'active' as const,
    };
    await api.createCompany(input);
    expect(request).toHaveBeenLastCalledWith(
      '/api/v1/companies',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.updateCompany('company-1', 3, input);
    expect(request).toHaveBeenLastCalledWith('/api/v1/companies/company-1', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer access-token',
        'if-match': '"3"',
      },
      body: JSON.stringify(input),
    });
  });
  it('sends typed company list parameters and reads a detail', async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ items: [], page: { limit: 20, nextCursor: null } }),
          { status: 200 },
        ),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.listCompanies({
      q: '青波',
      status: 'active',
      cursor: 'next',
      limit: 20,
    });
    expect(request).toHaveBeenLastCalledWith(
      '/api/v1/companies?q=%E9%9D%92%E6%B3%A2&status=active&cursor=next&limit=20',
      { headers: { authorization: 'Bearer access-token' } },
    );
  });
  it('soft-deletes a company and reads its audit trail', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), { status: 200 }),
      );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.deleteCompany(
      '22222222-2222-4222-8222-222222222222',
      2,
      '重複登録のため',
    );
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/v1/companies/22222222-2222-4222-8222-222222222222',
      {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer access-token',
          'if-match': '"2"',
        },
        body: JSON.stringify({ reason: '重複登録のため' }),
      },
    );
    await api.listCompanyAudit('22222222-2222-4222-8222-222222222222');
  });
  it('sends bearer authentication and typed query parameters', async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ items: [], page: { limit: 20, nextCursor: null } }),
          { status: 200 },
        ),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.listProjects({
      q: '基幹',
      status: 'open',
      recruitmentStatus: 'recruiting',
      cursor: 'next-page',
      limit: 20,
    });
    expect(request).toHaveBeenCalledWith(
      '/api/v1/projects?q=%E5%9F%BA%E5%B9%B9&status=open&recruitmentStatus=recruiting&cursor=next-page&limit=20',
      {
        headers: { authorization: 'Bearer access-token' },
      },
    );
  });

  it('maps an API error response to ApiClientError', async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: 'forbidden', message: 'Denied', requestId: 'req-1' },
          }),
          { status: 403 },
        ),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => null,
      fetch: request,
    });
    await expect(api.listProjects()).rejects.toEqual(
      new ApiClientError(403, 'forbidden', 'Denied', 'req-1'),
    );
  });

  it('sends a soft-delete reason with If-Match and accepts 204', async () => {
    const request = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.deleteProject(
      '11111111-1111-4111-8111-111111111111',
      2,
      '重複登録のため',
    );
    expect(request).toHaveBeenCalledWith(
      '/api/v1/projects/11111111-1111-4111-8111-111111111111',
      {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer access-token',
          'if-match': '"2"',
        },
        body: JSON.stringify({ reason: '重複登録のため' }),
      },
    );
  });
});
