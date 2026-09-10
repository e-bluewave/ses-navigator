import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countExpectedApplicationTables,
  evaluateLocalDbRestoreResult,
  parseRestoredTableCount,
} from './restore-drill-local-db-restore.mjs';

const passedTableSetParity = {
  complete: true,
  missingTableCount: 0,
  extraTableCount: 0,
};
const passedTombstoneParity = {
  complete: true,
  tombstoneTableCount: 8,
  expectedTombstoneCount: 12,
  restoredTombstoneCount: 12,
  tombstoneMismatchCount: 0,
};

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

test('accepts successful restore only with exact table and tombstone parity', () => {
  const result = evaluateLocalDbRestoreResult({
    restoreExitCode: 0,
    expectedApplicationTableCount: 120,
    restoredApplicationTableCount: 120,
    customRoleCountDiscovered: 0,
    tableSetParity: passedTableSetParity,
    tombstoneParity: passedTombstoneParity,
  });

  assert.equal(result.status, 'LOCAL_DB_RESTORE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.databaseRestoreTransactional, true);
  assert.equal(result.databaseOnErrorStop, true);
  assert.equal(result.schemaRestore, 'PASS');
  assert.equal(result.dataRestore, 'PASS');
  assert.equal(result.migrationParity, 'PASS');
  assert.equal(result.deletionTombstonesReapplied, 'PASS');
  assert.equal(result.tombstoneMismatchCount, 0);
});

test('fails closed when custom application roles exist', () => {
  const result = evaluateLocalDbRestoreResult({
    restoreExitCode: 0,
    expectedApplicationTableCount: 120,
    restoredApplicationTableCount: 120,
    customRoleCountDiscovered: 1,
    tableSetParity: passedTableSetParity,
    tombstoneParity: passedTombstoneParity,
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
    tableSetParity: null,
    tombstoneParity: null,
  });

  assert.equal(result.complete, false);
  assert.ok(result.findings.includes('database-restore-command-failed'));
});

test('fails when exact table set differs even if table count matches', () => {
  const result = evaluateLocalDbRestoreResult({
    restoreExitCode: 0,
    expectedApplicationTableCount: 120,
    restoredApplicationTableCount: 120,
    customRoleCountDiscovered: 0,
    tableSetParity: {
      complete: false,
      missingTableCount: 1,
      extraTableCount: 1,
    },
    tombstoneParity: passedTombstoneParity,
  });

  assert.equal(result.complete, false);
  assert.equal(result.migrationParity, 'FAIL');
  assert.ok(
    result.findings.includes('restored-application-table-set-mismatch'),
  );
});

test('fails when restored tombstone counts differ from backup', () => {
  const result = evaluateLocalDbRestoreResult({
    restoreExitCode: 0,
    expectedApplicationTableCount: 120,
    restoredApplicationTableCount: 120,
    customRoleCountDiscovered: 0,
    tableSetParity: passedTableSetParity,
    tombstoneParity: {
      ...passedTombstoneParity,
      complete: false,
      restoredTombstoneCount: 11,
      tombstoneMismatchCount: 1,
    },
  });

  assert.equal(result.complete, false);
  assert.equal(result.deletionTombstonesReapplied, 'FAIL');
  assert.ok(result.findings.includes('deletion-tombstone-parity-mismatch'));
});
