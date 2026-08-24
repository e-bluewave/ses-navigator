import assert from 'node:assert/strict';
import test from 'node:test';

import {
  closedSensitiveRelations,
  limitedSensitiveRelations,
  validateSensitiveDataApiSurface,
} from './check-sensitive-data-api-surface.mjs';

function reviewedSql({ omitView = null } = {}) {
  const statements = [];
  for (const relation of closedSensitiveRelations) {
    statements.push(`revoke select on table ${relation} from authenticated;`);
    statements.push(`revoke select on table ${relation} from anon;`);
  }
  for (const [relation, view] of Object.entries(limitedSensitiveRelations)) {
    statements.push(`revoke select on table ${relation} from authenticated;`);
    statements.push(`revoke select on table ${relation} from anon;`);
    if (view !== omitView) {
      statements.push(
        `create or replace view ${view} with (security_barrier = true, security_invoker = true) as select 1 as id;`,
      );
    }
    statements.push(`grant select on table ${view} to authenticated;`);
  }
  return statements.join('\n');
}

test('accepts the reviewed sensitive Data API manifest', () => {
  const result = validateSensitiveDataApiSurface([
    { name: 'reviewed.sql', source: reviewedSql() },
  ]);
  assert.equal(result.status, 'SENSITIVE_DATA_API_SURFACE_PASSED');
  assert.deepEqual(result.failures, []);
});

test('rejects a later full-table grant on raw source content', () => {
  const rawSourceGrant = [
    'grant select on table',
    'app.project_source_versions',
    'to authenticated;',
  ].join(' ');
  const result = validateSensitiveDataApiSurface([
    { name: 'reviewed.sql', source: reviewedSql() },
    { name: 'later.sql', source: rawSourceGrant },
  ]);
  assert.equal(result.status, 'SENSITIVE_DATA_API_SURFACE_FAILED');
  assert.ok(
    result.failures.includes(
      'authenticated must not have full SELECT on app.project_source_versions',
    ),
  );
});

test('allows column grants on a limited base table', () => {
  const result = validateSensitiveDataApiSurface([
    { name: 'reviewed.sql', source: reviewedSql() },
    {
      name: 'columns.sql',
      source:
        'grant select (id, project_id, source_type) on app.project_sources to authenticated;',
    },
  ]);
  assert.equal(result.status, 'SENSITIVE_DATA_API_SURFACE_PASSED');
});

test('rejects a missing reviewed limited view', () => {
  const missing = limitedSensitiveRelations['app.project_sources'];
  const result = validateSensitiveDataApiSurface([
    { name: 'missing.sql', source: reviewedSql({ omitView: missing }) },
  ]);
  assert.ok(
    result.failures.includes(`reviewed limited view is missing: ${missing}`),
  );
});
