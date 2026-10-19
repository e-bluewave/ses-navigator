import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const config = JSON.parse(
  readFileSync(new URL('../apps/web/vercel.json', import.meta.url), 'utf8'),
);
const rewrites = config.rewrites ?? [];

test('Staging Web has only an internal SPA fallback, never an API proxy', () => {
  assert.equal(config.framework, 'vite');
  assert.equal(config.buildCommand, 'pnpm build --mode staging');
  assert.equal(config.outputDirectory, 'dist');
  assert.equal(rewrites.length, 1);
  assert.equal(rewrites[0].destination, '/index.html');
  assert.equal(typeof rewrites[0].source, 'string');
  assert.equal(
    rewrites.some(({ destination }) => /^https?:/u.test(destination)),
    false,
  );
});

test('static Web responses deny framing, MIME sniffing, referrer leakage and cached auth pages', () => {
  assert.equal(config.headers.length, 1);
  assert.equal(config.headers[0].source, '/(.*)');
  const headers = Object.fromEntries(
    config.headers[0].headers.map(({ key, value }) => [
      key.toLowerCase(),
      value,
    ]),
  );
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['referrer-policy'], 'no-referrer');
  assert.equal(headers['cache-control'], 'no-store');
  assert.equal(
    headers['permissions-policy'],
    'camera=(), microphone=(), geolocation=()',
  );
  assert.equal(headers['access-control-allow-origin'], undefined);
});

test('SPA fallback handles sales routes but does not mask API and internal routes', () => {
  const pattern = new RegExp(`^${rewrites[0].source}$`, 'u');
  for (const path of [
    '/',
    '/dashboard',
    '/companies/123',
    '/engineers/123',
    '/projects/123',
    '/proposals/123',
    '/auth/callback',
  ]) {
    assert.equal(pattern.test(path), true, path);
  }
  for (const path of [
    '/api',
    '/api/v1/unknown',
    '/api/v1/proposals/123/messages/456/send',
    '/internal',
    '/internal/staging-runtime-identity',
    '/assets',
    '/assets/index.js',
  ]) {
    // Vercel rewrites do not distinguish HTTP methods: these exclusions must
    // therefore hold for mutations and preflights as well as page navigation.
    for (const method of [
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ]) {
      assert.equal(pattern.test(path), false, `${method} ${path}`);
    }
  }
});
