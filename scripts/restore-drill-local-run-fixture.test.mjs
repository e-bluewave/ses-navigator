import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAuthAdminHeaders,
  buildRuntimeEnvironmentFromStatus,
  buildValidationSetupSql,
  defaultSupabaseExecutable,
  parseSupabaseStatusEnvironment,
  runLocalRestoreDrillWithFixture,
} from './restore-drill-local-run-fixture.mjs';

const setupTemplate = `
begin;
select 'replace-user-a@example.invalid';
select 'replace-user-b@example.invalid';
select 'READY_FOR_VALIDATION';
commit;
`;
const cleanupSql = "select 'CLEANUP_PASSED';";
const credentials = {
  userAEmail: 'ba008-a-a1b2c3@example.test',
  userBEmail: 'ba008-b-a1b2c3@example.test',
  password: 'L0cal!BA008-test-password',
};

test('auth admin headers support local JWT and new secret keys', () => {
  assert.deepEqual(buildAuthAdminHeaders('sb_secret_test'), {
    apikey: 'sb_secret_test',
    'content-type': 'application/json',
  });
  assert.deepEqual(buildAuthAdminHeaders('legacy-local-jwt'), {
    apikey: 'legacy-local-jwt',
    Authorization: 'Bearer legacy-local-jwt',
    'content-type': 'application/json',
  });
});

test('local Supabase status is parsed without exposing values', () => {
  const statusText = [
    'API_URL="http://127.0.0.1:55321"',
    'ANON_KEY="local-anon-key"',
    'SERVICE_ROLE_KEY="local-service-role-key"',
  ].join('\n');
  const parsed = parseSupabaseStatusEnvironment(statusText);
  assert.equal(parsed.API_URL, 'http://127.0.0.1:55321');
  assert.equal(parsed.ANON_KEY, 'local-anon-key');
  assert.equal(parsed.SERVICE_ROLE_KEY, 'local-service-role-key');

  const env = buildRuntimeEnvironmentFromStatus(statusText, { KEEP: 'yes' });
  assert.equal(env.KEEP, 'yes');
  assert.equal(env.SESN_SUPABASE_URL, 'http://127.0.0.1:55321');
  assert.equal(env.SESN_RESTORE_STORAGE_URL, env.SESN_SUPABASE_URL);
  assert.equal(env.SESN_SUPABASE_PUBLISHABLE_KEY, 'local-anon-key');
  assert.equal(env.SESN_SUPABASE_SECRET_KEY, 'local-service-role-key');
  assert.equal(
    env.SESN_RESTORE_STORAGE_SERVICE_ROLE_KEY,
    'local-service-role-key',
  );

  assert.equal(defaultSupabaseExecutable('win32'), 'supabase.exe');
  assert.equal(defaultSupabaseExecutable('linux'), 'supabase');
});

test('validation setup replaces each generated email exactly once', () => {
  const sql = buildValidationSetupSql(setupTemplate, credentials);
  assert.ok(sql.includes(credentials.userAEmail));
  assert.ok(sql.includes(credentials.userBEmail));
  assert.ok(!sql.includes('replace-user-a@example.invalid'));
  assert.ok(!sql.includes('replace-user-b@example.invalid'));

  assert.throws(
    () =>
      buildValidationSetupSql(
        setupTemplate.replace('replace-user-b@example.invalid', 'missing'),
        credentials,
      ),
    /User B validation placeholder/u,
  );
});

test('wrapper prepares fixture inside measured restore and cleans it after restore returns', async () => {
  const events = [];
  const logs = [];
  const result = await runLocalRestoreDrillWithFixture({
    runFactsPath: 'private-facts.json',
    outputPath: 'private-evidence.json',
    env: {
      SESN_SUPABASE_URL: 'http://127.0.0.1:54321',
      SESN_SUPABASE_SECRET_KEY: 'local-service-role-jwt',
    },
    readFileImpl: async (path) => {
      if (path === 'private-facts.json') {
        return JSON.stringify({
          repoRoot: '/repo',
          db: {
            containerName: 'supabase_db_sesn-restore-drill',
            requiredNameToken: 'restore-drill',
          },
        });
      }
      if (String(path).endsWith('02_setup.sql')) return setupTemplate;
      if (String(path).endsWith('05_cleanup.sql')) return cleanupSql;
      throw new Error('unexpected read');
    },
    generateCredentials: () => credentials,
    createAdminClient: () => ({
      async createUser(email) {
        events.push(email === credentials.userAEmail ? 'create-a' : 'create-b');
        return email === credentials.userAEmail ? 'user-a-id' : 'user-b-id';
      },
      async deleteUser(id) {
        events.push(id === 'user-b-id' ? 'delete-b' : 'delete-a');
      },
    }),
    runPsql: async ({ sql }) => {
      if (sql.includes('replace-user-')) throw new Error('placeholder leaked');
      if (sql.includes('CLEANUP_PASSED')) {
        events.push('cleanup');
        return 'CLEANUP_PASSED';
      }
      events.push('setup');
      return 'READY_FOR_VALIDATION';
    },
    runLiveValidation: async ({ env }) => {
      events.push('live');
      assert.equal(env.SESN_TEST_USER_A_EMAIL, credentials.userAEmail);
      assert.equal(env.SESN_TEST_USER_B_EMAIL, credentials.userBEmail);
      assert.equal(env.SESN_TEST_EMAIL, credentials.userAEmail);
      return { status: 'LOCAL_LIVE_VALIDATION_PASSED', complete: true };
    },
    runRestoreDrill: async ({ env, runLiveValidation }) => {
      events.push('restore-start');
      assert.equal(env.SESN_TEST_USER_A_PASSWORD, credentials.password);
      await runLiveValidation({ repoRoot: '/repo', env });
      events.push('restore-finished');
      return {
        status: 'LOCAL_RESTORE_DRILL_PASSED',
        restoreDrillEvidence: 'RESTORE_DRILL_EVIDENCE_PASSED',
        rpoMinutes: 20,
        rtoMinutes: 3,
        followUpRequired: false,
        tiers: {
          tier1: { rpo: 'PASS', rto: 'PASS' },
          tier2: { rpo: 'PASS', rto: 'PASS' },
          tier3: { rpo: 'PASS', rto: 'PASS' },
        },
        storageBusinessFileRestoreClaimed: false,
      };
    },
    log: (value) => logs.push(value),
  });

  assert.deepEqual(events, [
    'restore-start',
    'create-a',
    'create-b',
    'setup',
    'live',
    'restore-finished',
    'cleanup',
    'delete-b',
    'delete-a',
  ]);
  assert.equal(result.validationFixtureLifecycle, 'PASS');
  const output = logs.join('\n');
  assert.ok(output.includes('LOCAL_RESTORE_DRILL_PASSED'));
  assert.ok(output.includes('LOCAL_DATA_API_FIXTURE_CLEANUP_PASSED'));
  assert.ok(!output.includes(credentials.userAEmail));
  assert.ok(!output.includes(credentials.userBEmail));
  assert.ok(!output.includes(credentials.password));
});

test('missing readiness marker still cleans a successfully applied fixture', async () => {
  const events = [];
  let psqlCalls = 0;
  await assert.rejects(
    runLocalRestoreDrillWithFixture({
      runFactsPath: 'private-facts.json',
      outputPath: 'private-evidence.json',
      env: {
        SESN_SUPABASE_URL: 'http://127.0.0.1:54321',
        SESN_SUPABASE_SECRET_KEY: 'local-service-role-jwt',
      },
      readFileImpl: async (path) => {
        if (path === 'private-facts.json') {
          return JSON.stringify({
            repoRoot: '/repo',
            db: {
              containerName: 'supabase_db_sesn-restore-drill',
              requiredNameToken: 'restore-drill',
            },
          });
        }
        if (String(path).endsWith('02_setup.sql')) return setupTemplate;
        if (String(path).endsWith('05_cleanup.sql')) return cleanupSql;
        throw new Error('unexpected read');
      },
      generateCredentials: () => credentials,
      createAdminClient: () => ({
        async createUser(email) {
          events.push(
            email === credentials.userAEmail ? 'create-a' : 'create-b',
          );
          return email === credentials.userAEmail ? 'user-a-id' : 'user-b-id';
        },
        async deleteUser(id) {
          events.push(id === 'user-b-id' ? 'delete-b' : 'delete-a');
        },
      }),
      runPsql: async () => {
        psqlCalls += 1;
        if (psqlCalls === 1) {
          events.push('setup');
          return 'setup committed but readiness marker missing';
        }
        events.push('cleanup');
        return 'CLEANUP_PASSED';
      },
      runLiveValidation: async () => {
        throw new Error('should not reach live validation');
      },
      runRestoreDrill: async ({ env, runLiveValidation }) =>
        runLiveValidation({ repoRoot: '/repo', env }),
      log: () => {},
    }),
    /Validation fixture readiness marker missing/u,
  );

  assert.deepEqual(events, [
    'create-a',
    'create-b',
    'setup',
    'cleanup',
    'delete-b',
    'delete-a',
  ]);
});

test('setup SQL failure removes generated Auth users without fixture cleanup', async () => {
  const events = [];
  await assert.rejects(
    runLocalRestoreDrillWithFixture({
      runFactsPath: 'private-facts.json',
      outputPath: 'private-evidence.json',
      env: {
        SESN_SUPABASE_URL: 'http://127.0.0.1:54321',
        SESN_SUPABASE_SECRET_KEY: 'local-service-role-jwt',
      },
      readFileImpl: async (path) => {
        if (path === 'private-facts.json') {
          return JSON.stringify({
            repoRoot: '/repo',
            db: {
              containerName: 'supabase_db_sesn-restore-drill',
              requiredNameToken: 'restore-drill',
            },
          });
        }
        if (String(path).endsWith('02_setup.sql')) return setupTemplate;
        if (String(path).endsWith('05_cleanup.sql')) return cleanupSql;
        throw new Error('unexpected read');
      },
      generateCredentials: () => credentials,
      createAdminClient: () => ({
        async createUser(email) {
          events.push(
            email === credentials.userAEmail ? 'create-a' : 'create-b',
          );
          return email === credentials.userAEmail ? 'user-a-id' : 'user-b-id';
        },
        async deleteUser(id) {
          events.push(id === 'user-b-id' ? 'delete-b' : 'delete-a');
        },
      }),
      runPsql: async () => {
        events.push('setup-failed');
        throw new Error('setup transaction failed');
      },
      runLiveValidation: async () => {
        throw new Error('should not reach live validation');
      },
      runRestoreDrill: async ({ env, runLiveValidation }) =>
        runLiveValidation({ repoRoot: '/repo', env }),
      log: () => {},
    }),
    /setup transaction failed/u,
  );

  assert.deepEqual(events, [
    'create-a',
    'create-b',
    'setup-failed',
    'delete-b',
    'delete-a',
  ]);
});

test('cleanup failure preserves fixture users for investigation and fails closed', async () => {
  const events = [];
  let psqlCalls = 0;
  await assert.rejects(
    runLocalRestoreDrillWithFixture({
      runFactsPath: 'private-facts.json',
      outputPath: 'private-evidence.json',
      env: {
        SESN_SUPABASE_URL: 'http://127.0.0.1:54321',
        SESN_SUPABASE_SECRET_KEY: 'local-service-role-jwt',
      },
      readFileImpl: async (path) => {
        if (path === 'private-facts.json') {
          return JSON.stringify({
            repoRoot: '/repo',
            db: {
              containerName: 'supabase_db_sesn-restore-drill',
              requiredNameToken: 'restore-drill',
            },
          });
        }
        if (String(path).endsWith('02_setup.sql')) return setupTemplate;
        if (String(path).endsWith('05_cleanup.sql')) return cleanupSql;
        throw new Error('unexpected read');
      },
      generateCredentials: () => credentials,
      createAdminClient: () => ({
        async createUser(email) {
          events.push(
            email === credentials.userAEmail ? 'create-a' : 'create-b',
          );
          return email === credentials.userAEmail ? 'user-a-id' : 'user-b-id';
        },
        async deleteUser() {
          events.push('unexpected-delete');
        },
      }),
      runPsql: async () => {
        psqlCalls += 1;
        if (psqlCalls === 1) {
          events.push('setup');
          return 'READY_FOR_VALIDATION';
        }
        events.push('cleanup-failed');
        return 'missing cleanup marker';
      },
      runLiveValidation: async () => ({ complete: true }),
      runRestoreDrill: async ({ env, runLiveValidation }) => {
        await runLiveValidation({ repoRoot: '/repo', env });
        return { status: 'LOCAL_RESTORE_DRILL_PASSED' };
      },
      log: () => {},
    }),
    /Validation fixture cleanup marker missing/u,
  );

  assert.deepEqual(events, ['create-a', 'create-b', 'setup', 'cleanup-failed']);
});
