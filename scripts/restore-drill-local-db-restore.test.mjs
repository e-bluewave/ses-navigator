import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countExpectedApplicationTables,
  evaluateLocalDbRestoreResult,
  parseRestoredTableCount,
} from './restore-drill-local-db-restore.mjs';

test('counts app/audit CREATE TABLE variants from backup schema', () => {
  const schema = `
CREATE TABLE app.projects (
  id uuid
);
CREATE TABLE "audit"."events" (
  id uuid
);
CREATE TABLE IF NOT EXISTS "app"."companies" (
  id uuid
);
CREATE TABLE public.ignored (
  id uuid
);
`;
  assert.equal(countExpectedApplicationTables(schema), 3);
});

test('parses restored table count safely', () => {
  assert.equal(parseRestoredTableCount('120\n'), 120);
  assert.equal(parseRestoredTableCount('0'), 0);
  assert.equal(parseRestoredTableCount('120 rows'), null);
  assert.equal(parseRestoredTableCount(''), null);
});

test('accepts successful empty-custom-role local restore with table parity', () => {
  const result = evaluateLocalDbRestoreResult({
    restoreExitCode: 0,
    expectedApplicationTableCount: 120,
    restoredApplicationTableCount: 120,
    customRoleCountDiscovered: 0,
  });

  assert.equal(result.status, 'LOCAL_DB_RESTORE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.databaseRestoreTransactional, true);
  assert.equal(result.databaseOnErrorStop, true);
  assert.equal(result.schemaRestore, 'PASS');
  assert.equal(result.dataRestore, 'PASS');
});

test('fails closed when custom application roles exist', () => {
  const result = evaluateLocalDbRestoreResult({
    restoreExitCode: 0,
    expectedApplicationTableCount: 120,
    restoredApplicationTableCount: 120,
    customRoleCountDiscovered: 1,
  });

  assert.equal(result.complete, false);
  assert.ok(
    result.findings.includes(
      'automatic-local-db-restore-requires-empty-custom-role-set',
    ),
  );
});

test('fails when the restore process exits non-zero', () => {
  const result = evaluateLocalDbRestoreResult({
    restoreExitCode: 1,
    expectedApplicationTableCount: 120,
    restoredApplicationTableCount: null,
    customRoleCountDiscovered: 0,
  });

  assert.equal(result.complete, false);
  assert.ok(result.findings.includes('database-restore-command-failed'));
});

test('fails when restored application table count differs from backup', () => {
  const result = evaluateLocalDbRestoreResult({
    restoreExitCode: 0,
    expectedApplicationTableCount: 120,
    restoredApplicationTableCount: 119,
    customRoleCountDiscovered: 0,
  });

  assert.equal(result.complete, false);
  assert.ok(
    result.findings.includes('restored-application-table-count-mismatch'),
  );
});
