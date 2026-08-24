import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRestoreDrillEvidence } from './check-restore-drill-evidence.mjs';

function validEvidence() {
  return {
    evidenceId: 'BA008-RESTORE-20260825-01',
    environment: 'Staging',
    startedAt: '2026-08-25T08:00:00+09:00',
    completedAt: '2026-08-25T09:20:00+09:00',
    productionTarget: false,
    separateRestoreEnvironment: true,
    productionSecretsReused: false,
    databaseBackupRunLinked: true,
    storageBackupRunLinked: true,
    restorePointAlignment: 'PASS',
    rolesRestore: 'PASS',
    schemaRestore: 'PASS',
    dataRestore: 'PASS',
    databaseRestoreTransactional: true,
    databaseOnErrorStop: true,
    storageRestore: 'PASS',
    storageObjectCountParity: 'PASS',
    storageTotalBytesParity: 'PASS',
    storageIntegrityVerification: 'PASS',
    databaseStorageConsistency: 'PASS',
    authSmokeTest: 'PASS',
    applicationSmokeTest: 'PASS',
    dataApiSecurityRegression: 'PASS',
    rlsTenantIsolation: 'PASS',
    storageInventoryVerification: 'PASS',
    representativeFileRead: 'PASS',
    migrationParity: 'PASS',
    deletionTombstonesReapplied: 'PASS',
    rtoMinutesMeasured: 80,
    recoveryPointAgeMinutesMeasured: 25,
    followUpRequired: false,
    secretOrPersonalDataExposed: false,
    secretFreeEvidence: true,
    notes: 'Provider-neutral Staging restore drill evidence.',
  };
}

test('accepts complete BA-008 restore drill evidence', () => {
  const result = validateRestoreDrillEvidence(validEvidence());
  assert.equal(result.status, 'RESTORE_DRILL_EVIDENCE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
});

test('rejects production target and production secret reuse', () => {
  const evidence = validEvidence();
  evidence.productionTarget = true;
  evidence.productionSecretsReused = true;
  const result = validateRestoreDrillEvidence(evidence);
  assert.ok(result.findings.includes('productionTarget-must-be-false'));
  assert.ok(result.findings.includes('productionSecretsReused-must-be-false'));
});

test('requires all restore and validation checks to pass', () => {
  const evidence = validEvidence();
  evidence.storageRestore = 'FAIL';
  evidence.dataApiSecurityRegression = 'FAIL';
  evidence.rlsTenantIsolation = 'FAIL';
  const result = validateRestoreDrillEvidence(evidence);
  assert.ok(result.findings.includes('storageRestore-must-pass'));
  assert.ok(result.findings.includes('dataApiSecurityRegression-must-pass'));
  assert.ok(result.findings.includes('rlsTenantIsolation-must-pass'));
});

test('requires non-negative measured RTO and recovery point age', () => {
  const evidence = validEvidence();
  evidence.rtoMinutesMeasured = -1;
  evidence.recoveryPointAgeMinutesMeasured = Number.NaN;
  const result = validateRestoreDrillEvidence(evidence);
  assert.ok(
    result.findings.includes('rtoMinutesMeasured-must-be-non-negative-number'),
  );
  assert.ok(
    result.findings.includes(
      'recoveryPointAgeMinutesMeasured-must-be-non-negative-number',
    ),
  );
});

test('requires follow-up reference when follow-up is required', () => {
  const evidence = validEvidence();
  evidence.followUpRequired = true;
  evidence.followUpReferencePresent = false;
  const result = validateRestoreDrillEvidence(evidence);
  assert.ok(result.findings.includes('follow-up-reference-required'));
});

test('rejects timestamps out of order, unknown fields, and sensitive values', () => {
  const evidence = validEvidence();
  evidence.completedAt = '2026-08-25T07:00:00+09:00';
  evidence.notes = 'postgresql://example.invalid';
  evidence.projectRef = 'must-not-be-recorded';
  const result = validateRestoreDrillEvidence(evidence);
  assert.ok(
    result.findings.includes('completed-at-must-not-precede-started-at'),
  );
  assert.ok(result.findings.includes('sensitive-restore-value:notes'));
  assert.ok(result.findings.includes('unknown-field:projectRef'));
});
