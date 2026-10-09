import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import {
  matchesStagingRuntimeIdentity,
  registerStagingRuntimeIdentityRoute,
} from './staging-runtime-identity.js';

const refHash = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
const staging = refHash('stagingexampleproject');
const production = refHash('productionexamplepro');
const commit = 'a'.repeat(40);
const host = 'ses-navigator-staging-abc123-ebw-s-projects.vercel.app';
const env = {
  VERCEL_PROJECT_ID: 'prj_gpgM7keccxqbJpZssLH5UOBSb0OU',
  VERCEL_ENV: 'preview',
  VERCEL_URL: host,
  VERCEL_GIT_COMMIT_SHA: commit,
  SUPABASE_URL: 'https://stagingexampleproject.supabase.co',
};

describe('Staging runtime identity probe', () => {
  it('accepts only exact independent staging match', () => {
    expect(
      matchesStagingRuntimeIdentity(env, host, commit, staging, production),
    ).toBe(true);
  });

  it.each([
    [{ VERCEL_PROJECT_ID: 'prj_other' }, staging, production],
    [{ VERCEL_ENV: 'production' }, staging, production],
    [
      { VERCEL_URL: 'ses-navigator-production-abc.vercel.app' },
      staging,
      production,
    ],
    [{ VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40) }, staging, production],
    [
      { SUPABASE_URL: 'https://productionexamplepro.supabase.co' },
      staging,
      production,
    ],
    [
      { SUPABASE_URL: 'https://stagingexampleproject.supabase.co.evil.test' },
      staging,
      production,
    ],
    [
      { SUPABASE_URL: 'http://stagingexampleproject.supabase.co' },
      staging,
      production,
    ],
    [
      { SUPABASE_URL: 'https://stagingexampleproject.supabase.co/path' },
      staging,
      production,
    ],
    [{ SUPABASE_URL: undefined }, staging, production],
    [{}, staging, staging],
  ])(
    'rejects environment confusion',
    (override, expectedStaging, expectedProduction) => {
      expect(
        matchesStagingRuntimeIdentity(
          { ...env, ...override },
          host,
          commit,
          expectedStaging,
          expectedProduction,
        ),
      ).toBe(false);
    },
  );

  it('returns only empty 204 or 404 with no cache', async () => {
    const app = Fastify();
    registerStagingRuntimeIdentityRoute(app);
    const previous = Object.fromEntries(
      Object.keys(env).map((key) => [key, process.env[key]]),
    );
    try {
      Object.assign(process.env, env);
      const headers = {
        host,
        'x-sesn-expected-commit': commit,
        'x-sesn-staging-ref-sha256': staging,
        'x-sesn-production-ref-sha256': production,
      };
      const ok = await app.inject({
        method: 'GET',
        url: '/internal/staging-runtime-identity',
        headers,
      });
      expect(ok.statusCode).toBe(204);
      expect(ok.body).toBe('');
      expect(ok.headers['cache-control']).toBe('no-store');

      const fail = await app.inject({
        method: 'GET',
        url: '/internal/staging-runtime-identity',
        headers: { ...headers, 'x-sesn-staging-ref-sha256': production },
      });
      expect(fail.statusCode).toBe(404);
      expect(fail.body).toBe('');
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await app.close();
    }
  });
});
