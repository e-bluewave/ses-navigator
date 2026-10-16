import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStagingApiProxyModel } from './lib/staging-web-api-proxy-model.mjs';

const webOrigin = 'https://ses-navigator-web-staging-fixture.vercel.app';
const id = '11111111-1111-4111-8111-111111111111';
const oidc = 'fixture-workload-identity';
const bearer = 'fixture-user-access-token';
const apiOrigin =
  'https://ses-navigator-staging-git-codex-issue-167-b1ce58-ebw-s-projects.vercel.app';

function request(path = '/api/v1/projects', options = {}) {
  return new Request(`${webOrigin}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${bearer}`,
      origin: webOrigin,
      'content-type': 'application/json',
      ...options.headers,
    },
  });
}

function fixture(overrides = {}) {
  const calls = [];
  let tokenCalls = 0;
  const handle = createStagingApiProxyModel({
    webOrigin,
    runtimeEnvironment: 'preview',
    getOidcToken: async () => {
      tokenCalls += 1;
      return oidc;
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ items: [] });
    },
    ...overrides,
  });
  return { handle, calls, tokenCalls: () => tokenCalls };
}

test('model requires injected transport and Preview, with no live defaults', () => {
  for (const overrides of [
    { runtimeEnvironment: 'production' },
    { runtimeEnvironment: 'development' },
    { webOrigin: apiOrigin },
    { webOrigin: 'http://localhost:55321' },
    { webOrigin: `${webOrigin}/path` },
    { webOrigin: `https://user:password@${new URL(webOrigin).host}` },
    { getOidcToken: undefined },
    { fetchImpl: undefined },
  ]) {
    assert.throws(() => fixture(overrides));
  }
});

test('same-origin GET forwards only user bearer and runtime workload identity', async () => {
  const { handle, calls } = fixture();
  const result = await handle(
    request('/api/v1/projects?limit=5', {
      headers: {
        cookie: 'vercel-session=fixture-cookie',
        'x-vercel-trusted-oidc-idp-token': 'untrusted-browser-token',
        'x-vercel-protection-bypass': 'untrusted-browser-bypass',
        'x-forwarded-host': 'production.example',
      },
    }),
  );
  assert.equal(result.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${apiOrigin}/api/v1/projects?limit=5`);
  const { headers, redirect, credentials, cache } = calls[0].options;
  assert.deepEqual(
    [...headers.keys()],
    ['accept', 'authorization', 'x-vercel-trusted-oidc-idp-token'],
  );
  assert.equal(headers.get('authorization'), `Bearer ${bearer}`);
  assert.equal(headers.get('x-vercel-trusted-oidc-idp-token'), oidc);
  assert.equal(redirect, 'manual');
  assert.equal(credentials, 'omit');
  assert.equal(cache, 'no-store');
  assert.equal(result.headers.get('cache-control'), 'no-store');
});

test('unknown endpoints, methods, origins, malformed identities and queries fail before token access', async () => {
  const { handle, calls, tokenCalls } = fixture();
  const cases = [
    [request('/api/v1/unknown'), 404],
    [request('/internal/staging-runtime-identity'), 404],
    [request('/api/v1/projects', { method: 'DELETE' }), 405],
    [request('/api/v1/projects', { method: 'OPTIONS' }), 405],
    [request('/api/v1/projects', { headers: { authorization: '' } }), 401],
    [
      request('/api/v1/projects', {
        headers: { origin: 'https://evil.example' },
      }),
      403,
    ],
    [
      request('/api/v1/projects', {
        headers: { 'sec-fetch-site': 'cross-site' },
      }),
      403,
    ],
    [request('/api/v1/projects?x-vercel-protection-bypass=fixture'), 400],
    [request('/api/v1/projects?limit=1&limit=2'), 400],
    [request('/api/v1/projects?q=%0A'), 400],
    [new Request('https://production.example/api/v1/projects'), 403],
    [request('/api/v1/projects%2Fother'), 403],
  ];
  for (const [input, status] of cases) {
    assert.equal((await handle(input)).status, status);
  }
  assert.equal(calls.length, 0);
  assert.equal(tokenCalls(), 0);
});

test('non-GET sales requests preserve body, row version and send idempotency key', async () => {
  const { handle, calls } = fixture();
  const path = `/api/v1/proposals/${id}/messages/${id}/send`;
  assert.equal(
    (await handle(request(path, { method: 'POST', body: '{}' }))).status,
    400,
  );
  const input = request(path, {
    method: 'POST',
    body: '{}',
    headers: { 'idempotency-key': 'fixture-delivery-key' },
  });
  assert.equal((await handle(input)).status, 200);
  assert.equal(
    calls[0].options.headers.get('idempotency-key'),
    'fixture-delivery-key',
  );
  assert.equal(calls[0].options.body, '{}');
  assert.equal(calls[0].options.method, 'POST');
  await handle(
    request(`/api/v1/projects/${id}`, {
      method: 'PUT',
      body: '{"projectName":"fixture"}',
      headers: { 'if-match': '"3"' },
    }),
  );
  assert.equal(calls[1].options.headers.get('if-match'), '"3"');
  assert.equal(calls[1].options.method, 'PUT');
});

test('writes require exact Origin and bounded JSON objects', async () => {
  const { handle, calls } = fixture();
  for (const input of [
    request('/api/v1/projects', {
      method: 'POST',
      body: '{}',
      headers: { origin: '' },
    }),
    request('/api/v1/projects', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'text/plain' },
    }),
    request('/api/v1/projects', { method: 'POST', body: '[]' }),
    request('/api/v1/projects', { method: 'POST', body: '{' }),
    request('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ text: 'x'.repeat(256 * 1024) }),
    }),
  ]) {
    assert.equal((await handle(input)).ok, false);
  }
  assert.equal(calls.length, 0);
});

test('upstream errors and redirects expose no response details or cookies and never retry', async () => {
  for (const status of [301, 302, 307, 401, 403, 409, 500]) {
    let count = 0;
    const { handle } = fixture({
      fetchImpl: async () => {
        count += 1;
        return new Response(`sensitive-fixture ${oidc} ${bearer}`, {
          status,
          headers: {
            location: 'https://evil.example',
            'set-cookie': 'fixture=secret',
          },
        });
      },
    });
    const result = await handle(request());
    assert.equal(result.status, status < 400 ? 502 : status);
    assert.doesNotMatch(
      await result.text(),
      /sensitive-fixture|fixture-workload|fixture-user/u,
    );
    assert.equal(result.headers.get('location'), null);
    assert.equal(result.headers.get('set-cookie'), null);
    assert.equal(result.headers.get('access-control-allow-origin'), null);
    assert.equal(count, 1);
  }
});

test('protection HTML, reflected credentials, oversized bodies and network errors fail safely', async () => {
  for (const fetchImpl of [
    async () => new Response('<html>Protection</html>'),
    async () => Response.json({ leaked: oidc }),
    async () =>
      new Response(String.raw`{"leaked":"\u0066ixture-workload-identity"}`, {
        headers: { 'content-type': 'application/json' },
      }),
    async () => Response.json({ leaked: bearer }),
    async () => Response.json({ data: 'x'.repeat(1024 * 1024) }),
    async () => {
      throw new Error(`fixture transport error ${oidc}`);
    },
  ]) {
    const { handle } = fixture({ fetchImpl });
    const result = await handle(request());
    assert.equal(result.status, 502);
    assert.doesNotMatch(
      await result.text(),
      /fixture-workload|fixture-user|transport error/u,
    );
  }
});
