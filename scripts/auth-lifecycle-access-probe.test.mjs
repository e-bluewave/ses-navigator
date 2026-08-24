import assert from 'node:assert/strict';
import test from 'node:test';

import { runAuthLifecycleAccessProbe } from './auth-lifecycle-access-probe.mjs';

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

const baseEnv = {
  SESN_SUPABASE_URL: 'https://example.supabase.co',
  SESN_SUPABASE_PUBLISHABLE_KEY: 'publishable-test-key',
  SESN_TEST_EMAIL: 'user@example.test',
  SESN_TEST_PASSWORD: 'test-password',
  SESN_API_URL: 'https://api.example.test',
};

test('accepts expected fresh-login and API success without logging secrets', async () => {
  const calls = [];
  const logs = [];
  const env = {
    ...baseEnv,
    SESN_AUTH_LIFECYCLE_PROBE_MODE: 'login',
    SESN_EXPECT_LOGIN: 'allow',
    SESN_EXPECT_API: 'allow',
  };

  const result = await runAuthLifecycleAccessProbe({
    env,
    log: (line) => logs.push(String(line)),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes('/auth/v1/token')) {
        return response(200, { access_token: 'secret-access-token' });
      }
      if (url.includes('/api/v1/projects')) return response(200, { items: [] });
      if (url.includes('/auth/v1/logout')) return response(204);
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  assert.deepEqual(result, { mode: 'login', login: 'allowed', api: 'allowed' });
  assert.equal(calls.length, 3);
  const joinedLogs = logs.join('\n');
  assert.equal(joinedLogs.includes('secret-access-token'), false);
  assert.equal(joinedLogs.includes(baseEnv.SESN_TEST_EMAIL), false);
  assert.equal(joinedLogs.includes(baseEnv.SESN_TEST_PASSWORD), false);
});

test('accepts expected login denial', async () => {
  const env = {
    ...baseEnv,
    SESN_AUTH_LIFECYCLE_PROBE_MODE: 'login',
    SESN_EXPECT_LOGIN: 'deny',
    SESN_EXPECT_API: 'skip',
  };

  const result = await runAuthLifecycleAccessProbe({
    env,
    log: () => undefined,
    fetchImpl: async (url) => {
      assert.ok(url.includes('/auth/v1/token'));
      return response(400, { error: 'invalid_grant' });
    },
  });

  assert.deepEqual(result, { mode: 'login', login: 'denied', api: 'skipped' });
});

test('accepts 401 for an existing revoked session token', async () => {
  const env = {
    SESN_AUTH_LIFECYCLE_PROBE_MODE: 'access-token',
    SESN_EXPECT_API: 'deny',
    SESN_API_URL: 'https://api.example.test',
    SESN_TEST_ACCESS_TOKEN: 'old-secret-token',
  };
  const logs = [];

  const result = await runAuthLifecycleAccessProbe({
    env,
    log: (line) => logs.push(String(line)),
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.example.test/api/v1/projects?limit=1');
      assert.equal(options.headers.authorization, 'Bearer old-secret-token');
      return response(401);
    },
  });

  assert.deepEqual(result, {
    mode: 'access-token',
    login: 'not-applicable',
    api: 'denied',
  });
  assert.equal(logs.join('\n').includes('old-secret-token'), false);
});

test('rejects a non-401/403 response when denial is expected', async () => {
  const env = {
    SESN_AUTH_LIFECYCLE_PROBE_MODE: 'access-token',
    SESN_EXPECT_API: 'deny',
    SESN_API_URL: 'https://api.example.test',
    SESN_TEST_ACCESS_TOKEN: 'old-secret-token',
  };

  await assert.rejects(
    () =>
      runAuthLifecycleAccessProbe({
        env,
        log: () => undefined,
        fetchImpl: async () => response(200, { items: [] }),
      }),
    /not rejected with 401\/403/u,
  );
});

test('validates mode and expectation configuration', async () => {
  await assert.rejects(
    () =>
      runAuthLifecycleAccessProbe({
        env: { SESN_AUTH_LIFECYCLE_PROBE_MODE: 'invalid' },
        fetchImpl: async () => response(200),
      }),
    /must be login or access-token/u,
  );
});
