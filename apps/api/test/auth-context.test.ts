import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';
import type { AuthContextRepository } from '../src/modules/auth/auth-context.js';

const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-1', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe('auth context API', () => {
  it('requires authentication', async () => {
    const app = buildApp({ authentication });
    apps.push(app);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/auth/context' }))
        .statusCode,
    ).toBe(401);
  });

  it('returns the server-side MFA policy decision', async () => {
    const authContext: AuthContextRepository = {
      requiresMfa: vi.fn(() => Promise.resolve(true)),
    };
    const app = buildApp({ authentication, authContext });
    apps.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/context',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ requiresMfa: true });
  });
});
