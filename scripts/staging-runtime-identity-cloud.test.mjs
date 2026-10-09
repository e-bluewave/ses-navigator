import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertStagingIdentityConfig,
  runStagingIdentityCheck,
  selectStagingDeployment,
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
};
const deployment = {
  projectId: binding.projectId,
  meta: {
    githubCommitSha: env.SESN_PR_HEAD_SHA,
    githubCommitRef: 'codex/issue-167-microsoft-graph-mail-provider',
  },
  state: 'READY',
  target: null,
  url: 'ses-navigator-staging-abc123-ebw-s-projects.vercel.app',
};

test('accepts independent distinct refs and a pinned staging deployment', () => {
  assert.equal(
    assertStagingIdentityConfig(env, binding).staging,
    env.SESN_STAGING_SUPABASE_REF,
  );
});

test('rejects same ref, wrong project, missing token, or missing head', () => {
  for (const [override, project] of [
    [{ SESN_PRODUCTION_SUPABASE_REF: env.SESN_STAGING_SUPABASE_REF }, binding],
    [{ VERCEL_TOKEN: '' }, binding],
    [{ SESN_PR_HEAD_SHA: '' }, binding],
    [{}, { ...binding, projectId: 'prj_other' }],
  ]) {
    assert.throws(() =>
      assertStagingIdentityConfig({ ...env, ...override }, project),
    );
  }
});

test('selects only one Ready immutable Preview deployment', () => {
  assert.equal(
    selectStagingDeployment(
      { deployments: [deployment] },
      env.SESN_PR_HEAD_SHA,
    ),
    `https://${deployment.url}`,
  );
  for (const changed of [
    { target: 'production' },
    { projectId: 'prj_other' },
    { state: 'QUEUED' },
    { url: 'ses-navigator-staging-green.vercel.app' },
    { meta: { ...deployment.meta, githubCommitSha: 'b'.repeat(40) } },
  ]) {
    assert.throws(() =>
      selectStagingDeployment(
        { deployments: [{ ...deployment, ...changed }] },
        env.SESN_PR_HEAD_SHA,
      ),
    );
  }
  assert.throws(() =>
    selectStagingDeployment(
      { deployments: [deployment, deployment] },
      env.SESN_PR_HEAD_SHA,
    ),
  );
});

test('only GET status 204 is accepted, never emitting refs', async () => {
  let passedHeaders;
  const lines = [];
  await runStagingIdentityCheck({
    env,
    binding,
    discover: async () => `https://${deployment.url}`,
    check: async (url, headers) => {
      assert.match(url, /\/internal\/staging-runtime-identity$/u);
      passedHeaders = headers;
      return '204';
    },
    log: (line) => lines.push(line),
  });
  assert.doesNotMatch(
    JSON.stringify({ passedHeaders, lines }),
    /stagingexampleproject|productionexamplepro|fixture-token/u,
  );
  await assert.rejects(() =>
    runStagingIdentityCheck({
      env,
      binding,
      discover: async () => `https://${deployment.url}`,
      check: async () => '404',
      log: () => {},
    }),
  );
});
