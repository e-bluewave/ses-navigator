import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTimedFetch,
  runDataApiSecuritySuite,
} from './data-api-security-suite.mjs';

const env = {
  SESN_SUPABASE_URL: 'https://example.supabase.co',
  SESN_SUPABASE_PUBLISHABLE_KEY: 'publishable',
  SESN_SUPABASE_SECRET_KEY: 'secret-role-key',
  SESN_TEST_USER_A_EMAIL: 'a@example.com',
  SESN_TEST_USER_A_PASSWORD: 'secret-a',
  SESN_TEST_USER_B_EMAIL: 'b@example.com',
  SESN_TEST_USER_B_PASSWORD: 'secret-b',
};

test('aggregates the 18, 19, and 8 check stages', async () => {
  const calls = [];
  const logs = [];
  const summary = await runDataApiSecuritySuite({
    env,
    stages: passingStages(calls),
    log: (value) => logs.push(value),
  });

  assert.equal(summary.status, 'DATA_API_SECURITY_SUITE_PASSED');
  assert.equal(summary.totalChecks, 45);
  assert.equal(summary.passed, 45);
  assert.equal(summary.failed, 0);
  assert.equal(summary.completedStages, 3);
  assert.deepEqual(calls, [
    'limited_views',
    'service_role_rpc',
    'runtime_boundary',
  ]);
  assert.equal(logs.length, 7);
  assert.deepEqual(
    logs.slice(0, 6).map((value) => JSON.parse(value).event),
    [
      'DATA_API_SECURITY_STAGE_STARTED',
      'DATA_API_SECURITY_STAGE_COMPLETED',
      'DATA_API_SECURITY_STAGE_STARTED',
      'DATA_API_SECURITY_STAGE_COMPLETED',
      'DATA_API_SECURITY_STAGE_STARTED',
      'DATA_API_SECURITY_STAGE_COMPLETED',
    ],
  );
  assert.doesNotMatch(
    logs.join('\n'),
    /secret-a|secret-b|secret-role-key|publishable/,
  );
});

test('stops before any stage when configuration is incomplete', async () => {
  let called = false;
  await assert.rejects(
    runDataApiSecuritySuite({
      env: {},
      stages: [
        {
          name: 'must_not_run',
          run: async () => {
            called = true;
          },
        },
      ],
      log: () => undefined,
    }),
    /Missing environment variables/,
  );
  assert.equal(called, false);
});

test('rejects a publishable key in the secret key slot before execution', async () => {
  let called = false;
  await assert.rejects(
    runDataApiSecuritySuite({
      env: { ...env, SESN_SUPABASE_SECRET_KEY: 'sb_publishable_wrong' },
      stages: [
        {
          name: 'must_not_run',
          run: async () => {
            called = true;
          },
        },
      ],
      log: () => undefined,
    }),
    /publishable key/,
  );
  assert.equal(called, false);
});

test('stops later stages and reports the failing component', async () => {
  const calls = [];
  const logs = [];
  const stages = passingStages(calls);
  stages[1] = {
    name: 'service_role_rpc',
    run: async ({ log }) => {
      calls.push('service_role_rpc');
      log(
        JSON.stringify({
          status: 'LIMITED_RPC_VALIDATION_FAILED',
          totalChecks: 19,
          passed: 18,
          failed: 1,
        }),
      );
      throw new Error('RPC boundary failed');
    },
  };

  await assert.rejects(
    runDataApiSecuritySuite({
      env,
      stages,
      log: (value) => logs.push(value),
    }),
    /failed at service_role_rpc/,
  );

  assert.deepEqual(calls, ['limited_views', 'service_role_rpc']);
  assert.equal(logs.length, 5);
  assert.equal(JSON.parse(logs[3]).event, 'DATA_API_SECURITY_STAGE_FAILED');
  const summary = JSON.parse(logs[4]);
  assert.equal(summary.status, 'DATA_API_SECURITY_SUITE_FAILED');
  assert.equal(summary.completedStages, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.components[1].error, 'RPC boundary failed');
});

test('aborts a stalled HTTP request after the configured timeout', async () => {
  const timedFetch = createTimedFetch(
    async (_input, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
      }),
    10,
  );

  await assert.rejects(
    timedFetch('https://example.test'),
    /timed out after 10 ms/,
  );
});

test('rejects an invalid configured timeout before a stage starts', async () => {
  let called = false;
  await assert.rejects(
    runDataApiSecuritySuite({
      env: { ...env, SESN_SECURITY_REQUEST_TIMEOUT_MS: 'invalid' },
      stages: [
        {
          name: 'must_not_run',
          run: async () => {
            called = true;
          },
        },
      ],
      log: () => undefined,
    }),
    /positive integer/,
  );
  assert.equal(called, false);
});

function passingStages(calls) {
  return [
    stage('limited_views', 18, 'VALIDATION_PASSED', calls),
    stage(
      'service_role_rpc',
      19,
      'SERVICE_ROLE_AND_RPC_VALIDATION_PASSED',
      calls,
    ),
    stage('runtime_boundary', 8, 'DATA_API_RUNTIME_BOUNDARY_PASSED', calls),
  ];
}

function stage(name, totalChecks, status, calls) {
  return {
    name,
    run: async () => {
      calls.push(name);
      return {
        status,
        totalChecks,
        passed: totalChecks,
        failed: 0,
      };
    },
  };
}
