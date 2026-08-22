import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expectedAuthenticatedWrites,
  validateDataApiWriteSurface,
} from './check-data-api-write-surface.mjs';

const baseline = Object.entries(expectedAuthenticatedWrites)
  .map(
    ([relation, privileges]) =>
      `grant ${privileges.join(', ')} on table ${relation} to authenticated;`,
  )
  .join('\n');

test('accepts the reviewed direct-write manifest', () => {
  const result = validateDataApiWriteSurface([
    { name: 'baseline.sql', source: baseline },
  ]);

  assert.equal(result.status, 'DATA_API_WRITE_SURFACE_PASSED');
  assert.deepEqual(result.failures, []);
});

test('rejects a new authenticated write relation', () => {
  const result = validateDataApiWriteSurface([
    {
      name: 'changed.sql',
      source: `${baseline}\ngrant insert on table app.contracts to authenticated;`,
    },
  ]);

  assert.equal(result.status, 'DATA_API_WRITE_SURFACE_FAILED');
  assert.match(result.failures.join('\n'), /reviewed manifest/);
});

test('rejects direct writes granted to anon', () => {
  const result = validateDataApiWriteSurface([
    {
      name: 'changed.sql',
      source: `${baseline}\ngrant update on table app.projects to anon;`,
    },
  ]);

  assert.match(result.failures.join('\n'), /anon/);
});

test('rejects Service Role writes on public relations', () => {
  const result = validateDataApiWriteSurface([
    {
      name: 'changed.sql',
      source: `${baseline}\ngrant all on table public.contract_summaries to service_role;`,
    },
  ]);

  assert.match(result.failures.join('\n'), /service_role/);
});

test('applies later revokes before comparing the manifest', () => {
  const result = validateDataApiWriteSurface([
    {
      name: '001.sql',
      source: `${baseline}\ngrant insert on table app.contracts to authenticated;`,
    },
    {
      name: '002.sql',
      source: 'revoke insert on table app.contracts from authenticated;',
    },
  ]);

  assert.equal(result.status, 'DATA_API_WRITE_SURFACE_PASSED');
});
