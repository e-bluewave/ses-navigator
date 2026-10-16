import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const config = JSON.parse(
  readFileSync(new URL('../apps/web/vercel.json', import.meta.url), 'utf8'),
);
const rewrites = config.rewrites ?? [];

test('Staging Web has only an internal SPA fallback, never an API proxy', () => {
  assert.equal(config.framework, 'vite');
  assert.equal(rewrites.length, 1);
  assert.equal(rewrites[0].destination, '/index.html');
  assert.equal(typeof rewrites[0].source, 'string');
  assert.equal(
    rewrites.some(({ destination }) => /^https?:/u.test(destination)),
    false,
  );
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
    '/api/v1/proposals/123/messages/456/send',
    '/internal/staging-runtime-identity',
    '/assets/index.js',
  ]) {
    assert.equal(pattern.test(path), false, path);
  }
});
