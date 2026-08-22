import assert from 'node:assert/strict';
import test from 'node:test';
import { runDataApiRuntimeBoundaryRegression } from './data-api-runtime-boundary-regression.mjs';

const env = {
  SESN_SUPABASE_URL: 'https://example.supabase.co',
  SESN_SUPABASE_PUBLISHABLE_KEY: 'publishable',
  SESN_TEST_USER_A_EMAIL: 'a@example.com',
  SESN_TEST_USER_A_PASSWORD: 'secret-a',
};
const probeId = '7affffff-ffff-4fff-8fff-ffffffffffff';
const tenantId = '7a110000-0000-4000-8000-000000000001';

test('passes all eight runtime schema and write boundary checks', async () => {
  const logs = [];
  const summary = await runDataApiRuntimeBoundaryRegression({
    env,
    fetchImpl: createFetch(),
    randomUuid: () => probeId,
    log: (value) => logs.push(value),
  });

  assert.equal(summary.status, 'DATA_API_RUNTIME_BOUNDARY_PASSED');
  assert.equal(summary.totalChecks, 8);
  assert.equal(summary.passed, 8);
  assert.equal(summary.mutatesData, false);
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs[0], /secret-a|token-a|publishable/);
});

test('fails if an unreviewed table update becomes reachable', async () => {
  await assert.rejects(
    runDataApiRuntimeBoundaryRegression({
      env,
      fetchImpl: createFetch({ exposeContractUpdate: true }),
      randomUuid: () => probeId,
      log: () => undefined,
    }),
    /runtime boundary regression failed \(1\/8\)/,
  );
});

test('stops before PATCH when the fresh probe ID already exists', async () => {
  let patchCalled = false;
  await assert.rejects(
    runDataApiRuntimeBoundaryRegression({
      env,
      fetchImpl: createFetch({
        probeExists: true,
        onPatch: () => (patchCalled = true),
      }),
      randomUuid: () => probeId,
      log: () => undefined,
    }),
    /probe target could not be verified/,
  );
  assert.equal(patchCalled, false);
});

test('fails before network access when configuration is missing', async () => {
  let called = false;
  await assert.rejects(
    runDataApiRuntimeBoundaryRegression({
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

function createFetch({
  exposeContractUpdate = false,
  probeExists = false,
  onPatch = () => undefined,
} = {}) {
  return async (url, options = {}) => {
    if (url.includes('/auth/v1/token')) {
      return Response.json({ access_token: 'token-a' });
    }
    if (url.includes('/auth/v1/logout')) {
      return new Response(null, { status: 204 });
    }

    const headers = new Headers(options.headers);
    const authenticated = headers.get('authorization') === 'Bearer token-a';
    const profile = headers.get('accept-profile');
    assert.equal(profile, headers.get('content-profile'));

    if (profile === 'audit') return Response.json({}, { status: 406 });
    if (!authenticated) return Response.json({}, { status: 401 });
    if (url.includes('/rpc/current_tenant_id')) {
      assert.equal(profile, 'public');
      return Response.json(tenantId);
    }
    if (url.includes('/rpc/service_get_sensitive_record')) {
      assert.equal(profile, 'public');
      return Response.json({}, { status: 403 });
    }

    assert.equal(profile, 'app');
    if (options.method === 'PATCH') {
      onPatch();
      if (url.includes('/contracts')) {
        return Response.json(exposeContractUpdate ? [] : {}, {
          status: exposeContractUpdate ? 200 : 403,
        });
      }
      return Response.json([]);
    }
    if (url.includes(`id=eq.${probeId}`)) {
      return Response.json(probeExists ? [{ id: probeId }] : []);
    }
    return Response.json([]);
  };
}
