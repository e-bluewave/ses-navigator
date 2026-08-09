import assert from 'node:assert/strict';
import test from 'node:test';

import { runAuthProjectSmoke } from './auth-project-smoke.mjs';

const env = {
  SESN_SUPABASE_URL: 'https://example.supabase.co/',
  SESN_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  SESN_TEST_EMAIL: 'smoke@example.com',
  SESN_TEST_PASSWORD: 'not-a-real-password',
  SESN_API_URL: 'https://api.example.com/',
};

test('logs in, calls projects with the access token, and logs out', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/token?'))
      return jsonResponse(200, { access_token: 'access-token' });
    if (url.includes('/api/v1/projects'))
      return jsonResponse(200, { items: [], page: { limit: 1 } });
    return jsonResponse(204, {});
  };

  await runAuthProjectSmoke({ env, fetchImpl, log: () => undefined });

  assert.equal(calls.length, 3);
  assert.equal(calls[1].options.headers.authorization, 'Bearer access-token');
  assert.equal(calls[2].options.headers.apikey, 'publishable-key');
});

test('does not call the API when required configuration is missing', async () => {
  let called = false;
  await assert.rejects(
    runAuthProjectSmoke({
      env: { ...env, SESN_TEST_PASSWORD: '' },
      fetchImpl: async () => {
        called = true;
        return jsonResponse(500, {});
      },
      log: () => undefined,
    }),
    /SESN_TEST_PASSWORD/,
  );
  assert.equal(called, false);
});

test('logs out even when the projects request is rejected', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.includes('/token?'))
      return jsonResponse(200, { access_token: 'access-token' });
    if (url.includes('/projects'))
      return jsonResponse(403, { code: 'forbidden' });
    return jsonResponse(204, {});
  };

  await assert.rejects(
    runAuthProjectSmoke({ env, fetchImpl, log: () => undefined }),
    /HTTP 403, code forbidden/,
  );
  assert.match(urls.at(-1), /\/auth\/v1\/logout$/);
});

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}
