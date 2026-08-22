import assert from 'node:assert/strict';
import test from 'node:test';
import { viewSpecs } from './data-api-security-regression.mjs';
import {
  resourceSpecs,
  runServiceRoleRpcSecurityRegression,
} from './service-role-rpc-security-regression.mjs';

const env = {
  SESN_SUPABASE_URL: 'https://example.supabase.co',
  SESN_SUPABASE_PUBLISHABLE_KEY: 'publishable',
  SESN_SUPABASE_SECRET_KEY: 'sb_secret_test',
  SESN_TEST_USER_A_EMAIL: 'a@example.com',
  SESN_TEST_USER_A_PASSWORD: 'secret-a',
};

test('passes all 19 Service Role and limited RPC checks', async () => {
  const logs = [];
  const summary = await runServiceRoleRpcSecurityRegression({
    env,
    fetchImpl: createFetch(),
    log: (value) => logs.push(value),
  });

  assert.equal(summary.status, 'SERVICE_ROLE_AND_RPC_VALIDATION_PASSED');
  assert.equal(summary.totalChecks, 19);
  assert.equal(summary.passed, 19);
  assert.equal(summary.failed, 0);
  assert.doesNotMatch(logs[0], /secret-a|sb_secret_test|token-a/);
});

test('stops before RPC calls when a user-facing view is accessible', async () => {
  const logs = [];
  await assert.rejects(
    runServiceRoleRpcSecurityRegression({
      env,
      fetchImpl: createFetch({ accessibleView: viewSpecs[0].name }),
      log: (value) => logs.push(value),
    }),
    /Service Role security regression failed \(1\/6\)/,
  );
  const summary = JSON.parse(logs[0]);
  assert.equal(summary.status, 'SERVICE_ROLE_VIEW_DENIAL_FAILED');
  assert.equal(summary.totalChecks, 6);
});

test('fails when an audit response contains a forbidden value', async () => {
  await assert.rejects(
    runServiceRoleRpcSecurityRegression({
      env,
      fetchImpl: createFetch({ leakAuditValue: true }),
      log: () => undefined,
    }),
    /Service Role security regression failed \(1\/19\)/,
  );
});

test('rejects a publishable key in the secret-key slot', async () => {
  await assert.rejects(
    runServiceRoleRpcSecurityRegression({
      env: { ...env, SESN_SUPABASE_SECRET_KEY: 'sb_publishable_wrong' },
      fetchImpl: async () => new Response(),
      log: () => undefined,
    }),
    /publishable key was supplied as the secret key/,
  );
});

function createFetch({ accessibleView, leakAuditValue = false } = {}) {
  return async (url, options = {}) => {
    if (url.includes('/auth/v1/token')) {
      return Response.json({ access_token: 'token-a' });
    }
    if (url.includes('/auth/v1/logout'))
      return new Response(null, { status: 204 });

    const view = viewSpecs.find((spec) => url.includes(`/${spec.name}?`));
    if (view) {
      return Response.json(
        {},
        { status: view.name === accessibleView ? 200 : 403 },
      );
    }

    assert.ok(url.endsWith('/rpc/service_get_sensitive_record'));
    const body = JSON.parse(options.body);
    const authorization = options.headers?.authorization;
    if (options.headers?.apikey === env.SESN_SUPABASE_PUBLISHABLE_KEY) {
      return Response.json({}, { status: authorization ? 403 : 401 });
    }
    if (body.p_resource_id === '7affffff-ffff-4fff-8fff-ffffffffffff') {
      return Response.json({}, { status: 404 });
    }
    const spec = resourceSpecs.find(
      (item) => item.type === body.p_resource_type,
    );
    assert.ok(spec);
    if (body.p_resource_id === spec.tenantBResourceId) {
      return Response.json({}, { status: 404 });
    }

    const payload = Object.fromEntries(
      spec.properties.map((property) => [property, null]),
    );
    payload.resource_type = spec.type;
    payload.tenant_id = '7a110000-0000-4000-8000-000000000001';
    payload[spec.idProperty] = spec.tenantAResourceId;
    if (leakAuditValue && spec.type === 'audit_event') {
      payload.metadata = { email: 'private-a@example.invalid' };
    }
    return Response.json(payload);
  };
}
