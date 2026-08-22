import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateSupabaseConfig } from './check-supabase-config.mjs';

const valid = `[api]
enabled = true
schemas = ["public", "graphql_public", "app"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
`;

test('accepts the committed local Supabase API boundary', async () => {
  const source = await readFile('supabase/config.toml', 'utf8');
  const result = validateSupabaseConfig(source);

  assert.equal(result.status, 'SUPABASE_CONFIG_PASSED');
  assert.deepEqual(result.failures, []);
  assert.equal(result.remoteChecked, false);
});

test('rejects a non-API internal schema in the exposed schemas list', () => {
  const source = valid.replace(
    '["public", "graphql_public", "app"]',
    '["public", "graphql_public", "app", "audit"]',
  );
  const result = validateSupabaseConfig(source);

  assert.equal(result.status, 'SUPABASE_CONFIG_FAILED');
  assert.match(result.failures.join('\n'), /internal schemas.*audit/);
});

test('rejects an internal schema in the extra search path', () => {
  const source = valid.replace(
    '["public", "extensions"]',
    '["public", "extensions", "private"]',
  );
  const result = validateSupabaseConfig(source);

  assert.equal(result.status, 'SUPABASE_CONFIG_FAILED');
  assert.match(result.failures.join('\n'), /internal schemas.*private/);
});

test('rejects excessive Data API row limits', () => {
  const result = validateSupabaseConfig(valid.replace('1000', '1001'));

  assert.match(result.failures.join('\n'), /max_rows/);
});

test('compares a supplied Dashboard Exposed schemas snapshot', () => {
  const passed = validateSupabaseConfig(valid, 'public, graphql_public, app');
  const failed = validateSupabaseConfig(valid, 'public, graphql_public');

  assert.equal(passed.remoteChecked, true);
  assert.equal(passed.status, 'SUPABASE_CONFIG_PASSED');
  assert.equal(failed.status, 'SUPABASE_CONFIG_FAILED');
  assert.match(failed.failures.join('\n'), /remote Exposed schemas/);
});
