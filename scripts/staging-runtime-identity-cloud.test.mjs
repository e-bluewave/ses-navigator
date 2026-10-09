import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertStagingIdentityConfig,
  runStagingIdentityCheck,
} from './staging-runtime-identity-cloud.mjs';

const env = {
  GITHUB_ACTIONS: 'true',
  GITHUB_EVENT_NAME: 'pull_request',
  GITHUB_REPOSITORY: 'e-bluewave/ses-navigator',
  GITHUB_HEAD_REF: 'codex/issue-167-microsoft-graph-mail-provider',
  SESN_READONLY_PREFLIGHT: 'true',
  ACTIONS_ID_TOKEN_REQUEST_URL:
    'https://pipelines.actions.githubusercontent.com/token',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture-runner-token',
  SESN_STAGING_SUPABASE_REF: 'stagingexampleproject',
  SESN_PRODUCTION_SUPABASE_REF: 'productionexamplepro',
  SESN_PR_HEAD_SHA: 'a'.repeat(40),
};

test('accepts only the pinned read-only PR job and distinct independent refs', () => {
  assert.equal(
    assertStagingIdentityConfig(env).staging,
    env.SESN_STAGING_SUPABASE_REF,
  );
  for (const override of [
    { GITHUB_EVENT_NAME: 'workflow_dispatch' },
    { GITHUB_REPOSITORY: 'other/repo' },
    { GITHUB_HEAD_REF: 'Main' },
    { SESN_PRODUCTION_SUPABASE_REF: env.SESN_STAGING_SUPABASE_REF },
    { ACTIONS_ID_TOKEN_REQUEST_TOKEN: '' },
    { SESN_PR_HEAD_SHA: '' },
  ]) {
    assert.throws(() => assertStagingIdentityConfig({ ...env, ...override }));
  }
});

test('only protected GET status 204 passes without logging token or refs', async () => {
  let passedHeaders;
  const lines = [];
  await runStagingIdentityCheck({
    env,
    getToken: async () => 'fixture-oidc-token',
    check: async (headers, token) => {
      assert.equal(token, 'fixture-oidc-token');
      passedHeaders = headers;
      return 204;
    },
    log: (line) => lines.push(line),
  });
  assert.doesNotMatch(
    JSON.stringify({ passedHeaders, lines }),
    /stagingexampleproject|productionexamplepro|fixture-oidc-token/u,
  );
  await assert.rejects(() =>
    runStagingIdentityCheck({
      env,
      getToken: async () => 'fixture-oidc-token',
      check: async () => 403,
      log: () => {},
    }),
  );
});
