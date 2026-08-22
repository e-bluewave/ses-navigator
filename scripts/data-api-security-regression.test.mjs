import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runDataApiSecurityRegression,
  viewSpecs,
} from './data-api-security-regression.mjs';

const env = {
  SESN_SUPABASE_URL: 'https://example.supabase.co',
  SESN_SUPABASE_PUBLISHABLE_KEY: 'publishable',
  SESN_TEST_USER_A_EMAIL: 'a@example.com',
  SESN_TEST_USER_A_PASSWORD: 'secret-a',
  SESN_TEST_USER_B_EMAIL: 'b@example.com',
  SESN_TEST_USER_B_PASSWORD: 'secret-b',
};

test('passes all 18 anonymous and tenant-bound view checks', async () => {
  const logs = [];
  const summary = await runDataApiSecurityRegression({
    env,
    fetchImpl: createFetch(),
    log: (value) => logs.push(value),
  });

  assert.equal(summary.status, 'VALIDATION_PASSED');
  assert.equal(summary.totalChecks, 18);
  assert.equal(summary.passed, 18);
  assert.equal(summary.failed, 0);
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs[0], /secret-a|secret-b|token-a|token-b/);
});

test('fails when User A can see a Tenant B row', async () => {
  const fetchImpl = createFetch({ exposeTenantB: true });

  await assert.rejects(
    runDataApiSecurityRegression({ env, fetchImpl, log: () => undefined }),
    /Data API security regression failed \(1\/18\)/,
  );
});

test('fails before network access when required configuration is missing', async () => {
  let called = false;
  await assert.rejects(
    runDataApiSecurityRegression({
      env: {},
      fetchImpl: async () => {
        called = true;
        return new Response();
      },
      log: () => undefined,
    }),
    /Missing environment variables/,
  );
  assert.equal(called, false);
});

function createFetch({ exposeTenantB = false } = {}) {
  return async (url, options = {}) => {
    if (url.includes('/auth/v1/token')) {
      const credentials = JSON.parse(options.body);
      const actor =
        credentials.email === env.SESN_TEST_USER_A_EMAIL ? 'a' : 'b';
      return Response.json({
        access_token: `token-${actor}`,
        user: { id: `user-${actor}` },
      });
    }
    if (url.includes('/auth/v1/logout'))
      return new Response(null, { status: 204 });

    const spec = viewSpecs.find((item) => url.includes(`/${item.name}?`));
    assert.ok(spec, `unexpected URL: ${url}`);
    const authorization = options.headers?.authorization;
    if (!authorization) return Response.json({}, { status: 401 });
    if (authorization === 'Bearer token-b') return Response.json([]);

    const row = Object.fromEntries(
      spec.columns.map((column) => [column, null]),
    );
    row[spec.idColumn] = spec.tenantAId;
    if (!exposeTenantB || spec !== viewSpecs[0]) return Response.json([row]);

    const tenantB = { ...row, [spec.idColumn]: spec.tenantBId };
    return Response.json([row, tenantB]);
  };
}
