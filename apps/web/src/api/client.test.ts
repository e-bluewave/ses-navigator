import { describe, expect, it, vi } from 'vitest';

import { ApiClientError, createProjectsApi } from './client.js';

describe('generated projects API client', () => {
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
});
