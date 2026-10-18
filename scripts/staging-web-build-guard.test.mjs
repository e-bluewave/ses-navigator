import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { assertStagingWebBuildEnvironment } from './lib/staging-web-build-guard.mjs';

const stage = 's'.repeat(20);
const production = 'p'.repeat(20);
function fixture(overrides = {}) {
  return {
    VERCEL: '1',
    VERCEL_ENV: 'preview',
    VERCEL_GIT_REPO_OWNER: 'e-bluewave',
    VERCEL_GIT_REPO_SLUG: 'ses-navigator',
    VERCEL_GIT_COMMIT_REF: 'codex/issue-167-microsoft-graph-mail-provider',
    VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
    VERCEL_PROJECT_ID: 'prj_fixtureWeb',
    SESN_STAGING_WEB_VERCEL_PROJECT_ID: 'prj_fixtureWeb',
    SESN_STAGING_SUPABASE_REF: stage,
    SESN_PRODUCTION_SUPABASE_REF: production,
    VITE_SUPABASE_URL: `https://${stage}.supabase.co`,
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixtureOnly',
    ...overrides,
  };
}
const legacy = (claim) =>
  `e30.${Buffer.from(JSON.stringify(claim)).toString('base64url')}.fixture`;

test('accepts explicit Preview build configuration, without claiming runtime identity', () => {
  assert.doesNotThrow(() => assertStagingWebBuildEnvironment(fixture()));
  assert.doesNotThrow(() =>
    assertStagingWebBuildEnvironment(
      fixture({
        VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
        VITE_SUPABASE_ANON_KEY: legacy({ role: 'anon', ref: stage }),
      }),
    ),
  );
});

test('missing, Production and conflicting independently supplied identities fail closed', () => {
  const valid = fixture();
  for (const name of Object.keys(valid)) {
    assert.throws(
      () => assertStagingWebBuildEnvironment({ ...valid, [name]: undefined }),
      /configuration rejected/u,
      name,
    );
  }
  for (const overrides of [
    { VERCEL_ENV: 'production' },
    { VERCEL_ENV: 'development' },
    { VERCEL_GIT_REPO_OWNER: 'other' },
    { VERCEL_GIT_REPO_SLUG: 'other' },
    { VERCEL_GIT_COMMIT_REF: 'Main' },
    { VERCEL_GIT_COMMIT_SHA: 'main' },
    { VERCEL_PROJECT_ID: 'prj_other' },
    { SESN_STAGING_SUPABASE_REF: production },
    { SESN_PRODUCTION_SUPABASE_REF: stage },
  ])
    assert.throws(() => assertStagingWebBuildEnvironment(fixture(overrides)));
});

test('URLs cannot select local, Production, custom host or credential-bearing targets', () => {
  for (const url of [
    `https://${production}.supabase.co`,
    'http://127.0.0.1:55321',
    `http://${stage}.supabase.co`,
    `https://${stage}.supabase.co.evil.test`,
    `https://user:password@${stage}.supabase.co`,
    `https://${stage}.supabase.co:8443`,
    `https://${stage}.supabase.co/auth`,
    `https://${stage}.supabase.co?token=fixture-sensitive`,
    `https://${stage}.supabase.co#fixture-sensitive`,
    'invalid-fixture-sensitive',
  ]) {
    const failure = assert.throws;
    failure(
      () =>
        assertStagingWebBuildEnvironment(fixture({ VITE_SUPABASE_URL: url })),
      (error) => {
        assert.equal(error.message, 'Staging Web build configuration rejected');
        return true;
      },
    );
  }
});

test('public env allowlist rejects external API base, tokens and unrecognized public values', () => {
  for (const name of [
    'VITE_API_BASE_URL',
    'VITE_SMTP_PASSWORD',
    'VITE_VERCEL_OIDC_TOKEN',
    'VITE_UNKNOWN',
  ]) {
    assert.throws(() =>
      assertStagingWebBuildEnvironment(
        fixture({ [name]: 'fixture-sensitive' }),
      ),
    );
  }
  // Non-public Vercel platform token values are not read by this checker.
  const env = fixture();
  Object.defineProperty(env, 'VERCEL_OIDC_TOKEN', {
    enumerable: true,
    get() {
      throw new Error('must not read');
    },
  });
  assert.doesNotThrow(() => assertStagingWebBuildEnvironment(env));
});

test('both public key aliases are checked, including privilege and legacy project mismatch', () => {
  for (const key of [
    'sb_secret_fixtureSensitive',
    'garbage-fixtureSensitive',
    legacy({ role: 'service_role', ref: stage }),
    legacy({ role: 'anon', ref: production }),
  ]) {
    assert.throws(() =>
      assertStagingWebBuildEnvironment(
        fixture({ VITE_SUPABASE_ANON_KEY: key }),
      ),
    );
  }
});

test('actual staging-mode Vite entry rejects missing platform identity before creating output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sesn-staging-build-'));
  const output = join(directory, 'dist');
  try {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL('../apps/web/node_modules/vite/bin/vite.js', import.meta.url),
        ),
        'build',
        '--mode',
        'staging',
        '--config',
        fileURLToPath(new URL('../apps/web/vite.config.ts', import.meta.url)),
        '--outDir',
        output,
      ],
      {
        cwd: directory,
        env: {},
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    assert.equal(result.status, 1, result.error?.message);
    assert.match(result.stderr, /Staging Web build configuration rejected/u);
    assert.equal(existsSync(output), false);
    assert.doesNotMatch(
      result.stderr,
      /supabase\.co|sb_publishable_|sb_secret_/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
