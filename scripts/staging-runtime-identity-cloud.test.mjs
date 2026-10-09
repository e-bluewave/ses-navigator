import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertStagingIdentityConfig,
  runStagingIdentityCheck,
} from './staging-runtime-identity-cloud.mjs';

const binding = {
  projectId: 'prj_gpgM7keccxqbJpZssLH5UOBSb0OU',
  orgId: 'team_Wd9vCeAN0Q0MZCaqKXtVjRRw',
};
const env = {
  GITHUB_ACTIONS: 'true',
  SESN_READONLY_PREFLIGHT: 'true',
  VERCEL_TOKEN: 'fixture-token',
  SESN_STAGING_SUPABASE_REF: 'stagingexampleproject',
  SESN_PRODUCTION_SUPABASE_REF: 'productionexamplepro',
  SESN_PR_HEAD_SHA: 'a'.repeat(40),
  SESN_STAGING_IDENTITY_DEPLOYMENT_URL:
    'https://ses-navigator-staging-abc123-ebw-s-projects.vercel.app',
};

test('accepts independent distinct refs and a pinned staging deployment', () => {
  assert.equal(
    assertStagingIdentityConfig(env, binding).staging,
    env.SESN_STAGING_SUPABASE_REF,
  );
});

test('rejects same ref, alias, wrong project, missing token, or missing head', () => {
  for (const [override, project] of [
    [{ SESN_PRODUCTION_SUPABASE_REF: env.SESN_STAGING_SUPABASE_REF }, binding],
    [{ SESN_STAGING_IDENTITY_DEPLOYMENT_URL: 'https://ses-navigator-staging-green.vercel.app' }, binding],
    [{ VERCEL_TOKEN: '' }, binding],
    [{ SESN_PR_HEAD_SHA: '' }, binding],
    [{}, { ...binding, projectId: 'prj_other' }],
  ]) {
    assert.throws(() => assertStagingIdentityConfig({ ...env, ...override }, project));
  }
});

test('only GET status 204 is accepted, never emitting refs', async () => {
  let passedHeaders;
  const lines = [];
  await runStagingIdentityCheck({
    env,
    binding,
    check: async (url, headers) => {
      assert.match(url, /\/internal\/staging-runtime-identity$/u);
      passedHeaders = headers;
      return '204';
    },
    log: (line) => lines.push(line),
  });
  assert.doesNotMatch(JSON.stringify({ passedHeaders, lines }), /stagingexampleproject|productionexamplepro|fixture-token/u);
  await assert.rejects(() => runStagingIdentityCheck({ env, binding, check: async () => '404', log: () => {} }));
});
