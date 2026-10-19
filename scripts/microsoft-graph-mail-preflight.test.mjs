import assert from 'node:assert/strict';
import test from 'node:test';

import { runMicrosoftGraphMailPreflight } from './microsoft-graph-mail-preflight.mjs';

const env = {
  MESSAGE_DELIVERY_PROVIDER: 'microsoft_graph',
  MICROSOFT_GRAPH_TENANT_ID: 'tenant-id',
  MICROSOFT_GRAPH_CLIENT_ID: 'client-id',
  MICROSOFT_GRAPH_CLIENT_SECRET: 'not-a-real-secret',
  MICROSOFT_GRAPH_SENDER: 'sender@example.com',
};

test('passes without sending mail when token contains Mail.Send', async () => {
  const calls = [];
  const result = await runMicrosoftGraphMailPreflight({
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(200, {
        access_token: jwt({ roles: ['Mail.Send'] }),
        expires_in: 3600,
      });
    },
    log: () => undefined,
  });

  assert.equal(result.status, 'MICROSOFT_GRAPH_MAIL_PREFLIGHT_PASSED');
  assert.equal(result.mailSendRole, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /oauth2\/v2\.0\/token$/u);
  assert.equal(calls[0].options.method, 'POST');
  assert.match(
    String(calls[0].options.body),
    /scope=https%3A%2F%2Fgraph\.microsoft\.com%2F\.default/u,
  );
});

test('fails closed when configuration is missing', async () => {
  let called = false;
  await assert.rejects(
    runMicrosoftGraphMailPreflight({
      env: { ...env, MICROSOFT_GRAPH_CLIENT_SECRET: '' },
      fetchImpl: async () => {
        called = true;
        return jsonResponse(500, {});
      },
      log: () => undefined,
    }),
    /MICROSOFT_GRAPH_CLIENT_SECRET/u,
  );
  assert.equal(called, false);
});

test('rejects token without Mail.Send application role', async () => {
  await assert.rejects(
    runMicrosoftGraphMailPreflight({
      env,
      fetchImpl: async () =>
        jsonResponse(200, {
          access_token: jwt({ roles: ['User.Read.All'] }),
          expires_in: 3600,
        }),
      log: () => undefined,
    }),
    /Mail\.Send application role/u,
  );
});

test('reports only safe status for authentication failure', async () => {
  const logs = [];
  await assert.rejects(
    runMicrosoftGraphMailPreflight({
      env,
      fetchImpl: async () =>
        jsonResponse(401, {
          error: 'invalid_client',
          error_description: 'do-not-log-provider-detail',
        }),
      log: (value) => logs.push(value),
    }),
    /HTTP 401/u,
  );
  assert.equal(
    JSON.stringify(logs).includes('do-not-log-provider-detail'),
    false,
  );
});

test('requires microsoft_graph provider mode', async () => {
  await assert.rejects(
    runMicrosoftGraphMailPreflight({
      env: { ...env, MESSAGE_DELIVERY_PROVIDER: 'disabled' },
      fetchImpl: async () => jsonResponse(500, {}),
      log: () => undefined,
    }),
    /must be microsoft_graph/u,
  );
});

function jwt(payload) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`;
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}
