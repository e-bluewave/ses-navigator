import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertStagingIdentityConfig,
  assertOidcClaims,
  githubOidcToken,
  protectedStatus,
  runStagingIdentityCheck,
} from './staging-runtime-identity-cloud.mjs';

const env = {
  GITHUB_ACTIONS: 'true',
  GITHUB_EVENT_NAME: 'pull_request',
  GITHUB_REPOSITORY: 'e-bluewave/ses-navigator',
  GITHUB_HEAD_REF: 'codex/issue-167-microsoft-graph-mail-provider',
  GITHUB_REF: 'refs/pull/168/merge',
  SESN_READONLY_PREFLIGHT: 'true',
  ACTIONS_ID_TOKEN_REQUEST_URL:
    'https://pipelines.actions.githubusercontent.com/token',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture-runner-token',
  SESN_STAGING_SUPABASE_REF: 'stagingexampleproject',
  SESN_PRODUCTION_SUPABASE_REF: 'productionexamplepro',
  SESN_PR_HEAD_SHA: 'a'.repeat(40),
};

const claims = {
  iss: 'https://token.actions.githubusercontent.com',
  aud: 'https://github.com/e-bluewave',
  repository: 'e-bluewave/ses-navigator',
  sub: 'repo:e-bluewave/ses-navigator:environment:sesn-staging-readonly',
  environment: 'sesn-staging-readonly',
  event_name: 'pull_request',
  head_ref: 'codex/issue-167-microsoft-graph-mail-provider',
  ref: 'refs/pull/168/merge',
  workflow_ref:
    'e-bluewave/ses-navigator/.github/workflows/staging-readonly-cloud.yml@refs/pull/168/merge',
};
const tokenFor = (payload) =>
  `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture`;
const fixtureToken = tokenFor(claims);

test('checks every trusted claim locally without exposing a token', () => {
  assert.doesNotThrow(() => assertOidcClaims(fixtureToken));
  for (const name of Object.keys(claims)) {
    assert.throws(() => assertOidcClaims(tokenFor({ ...claims, [name]: 'wrong' })));
  }
  assert.throws(() => assertOidcClaims('malformed-token'));
});

test('accepts only the pinned read-only PR job and distinct independent refs', () => {
  assert.equal(
    assertStagingIdentityConfig(env).staging,
    env.SESN_STAGING_SUPABASE_REF,
  );
  for (const override of [
    { GITHUB_EVENT_NAME: 'workflow_dispatch' },
    { GITHUB_REPOSITORY: 'other/repo' },
    { GITHUB_HEAD_REF: 'Main' },
    { GITHUB_REF: 'refs/heads/Main' },
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
    getToken: async () => fixtureToken,
    check: async (headers, token) => {
      assert.equal(token, fixtureToken);
      passedHeaders = headers;
      return 204;
    },
    log: (line) => lines.push(line),
  });
  assert.doesNotMatch(
    JSON.stringify({ passedHeaders, lines }),
    /stagingexampleproject|productionexamplepro/u,
  );
  assert.equal(JSON.stringify({ passedHeaders, lines }).includes(fixtureToken), false);
  await assert.rejects(() =>
    runStagingIdentityCheck({
      env,
      getToken: async () => fixtureToken,
      check: async () => 403,
      log: () => {},
    }),
  );
});

test('OIDC token request and protected probe stay on pinned HTTPS hosts', async () => {
  const token = await githubOidcToken(env, async (url, options) => {
    assert.equal(url.hostname, 'pipelines.actions.githubusercontent.com');
    assert.equal(
      url.searchParams.get('audience'),
      'https://github.com/e-bluewave',
    );
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.authorization, 'Bearer fixture-runner-token');
    return { ok: true, json: async () => ({ value: fixtureToken }) };
  });
  const status = await protectedStatus({}, token, async (url, options) => {
    assert.equal(
      url,
      'https://ses-navigator-staging-git-codex-issue-167-b1ce58-ebw-s-projects.vercel.app/internal/staging-runtime-identity',
    );
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers['x-vercel-trusted-oidc-idp-token'], token);
    return { status: 204 };
  });
  assert.equal(status, 204);
  await assert.rejects(() =>
    githubOidcToken(
      { ...env, ACTIONS_ID_TOKEN_REQUEST_URL: 'https://evil.example/token' },
      async () => {
        throw new Error('unexpected request');
      },
    ),
  );
});
