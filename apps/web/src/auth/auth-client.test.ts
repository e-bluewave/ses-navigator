import { describe, expect, it, vi } from 'vitest';

import { createSupabaseAuthService } from './auth-client.js';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

const sessionBody = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 3600,
  user: { id: 'user-1', email: 'user@example.com' },
};

describe('Supabase Auth service', () => {
  it('signs in and restores the stored session', async () => {
    const storage = memoryStorage();
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify(sessionBody), { status: 200 }),
      ),
    );
    const auth = createSupabaseAuthService({
      url: 'https://example.supabase.co',
      publishableKey: 'publishable-key',
      fetch: request,
      storage,
      now: () => 1_000_000,
    });
    const session = await auth.signIn('user@example.com', 'password');
    expect(session.accessToken).toBe('access-1');
    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe(
      'https://example.supabase.co/auth/v1/token?grant_type=password',
    );
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ apikey: 'publishable-key' });
    await expect(auth.getSession()).resolves.toEqual(session);
  });

  it('refreshes an expiring session and rotates the refresh token', async () => {
    const storage = memoryStorage();
    storage.setItem(
      'sesn.auth.session',
      JSON.stringify({
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        expiresAt: 1000,
        user: { id: 'user-1', email: 'user@example.com' },
      }),
    );
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify(sessionBody), { status: 200 }),
      ),
    );
    const auth = createSupabaseAuthService({
      url: 'https://example.supabase.co',
      publishableKey: 'publishable-key',
      fetch: request,
      storage,
      now: () => 1_000_000,
    });
    await expect(auth.getSession()).resolves.toMatchObject({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    expect(request).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/token?grant_type=refresh_token',
      expect.objectContaining({
        body: JSON.stringify({ refresh_token: 'old-refresh' }),
      }),
    );
  });
});
