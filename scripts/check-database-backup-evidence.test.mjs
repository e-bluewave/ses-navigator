import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDatabaseBackupEvidence } from './check-database-backup-evidence.mjs';

function validEvidence() {
  return {
    evidenceId: 'BA006-DB-BACKUP-20260825-01',
    environment: 'Staging',
    completedAt: '2026-08-25T07:30:00+09:00',
    postgresMajorVersion: 17,
    rolesDumpCreated: true,
    schemaDumpCreated: true,
    dataDumpCreated: true,
    dataUsedCopy: true,
    rolesSizeBytes: 1024,
    schemaSizeBytes: 4096,
    dataSizeBytes: 8192,
    rolesChecksumVerified: true,
    schemaChecksumVerified: true,
    dataChecksumVerified: true,
    connectionMode: 'direct',
    offsiteDestinationConfirmed: true,
    sameSupabaseProjectDestination: false,
    repositoryDestination: false,
    githubActionsArtifactLongTermDestination: false,
    tlsInTransit: true,
    encryptedAtRest: true,
    retentionDays: 35,
    frequencyHours: 24,
    manifestCreated: true,
    secretExposureReview: 'PASS',
    databaseUrlExposed: false,
    databasePasswordExposed: false,
    secretFreeEvidence: true,
    notes: 'Provider-neutral Staging backup evidence.',
  };
}

test('accepts complete BA-006 backup evidence', () => {
  const result = validateDatabaseBackupEvidence(validEvidence());
  assert.equal(result.status, 'DATABASE_BACKUP_EVIDENCE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
});

test('rejects transaction pooler and unsafe destinations', () => {
  const evidence = validEvidence();
  evidence.connectionMode = 'transaction-pooler';
  evidence.sameSupabaseProjectDestination = true;
  evidence.repositoryDestination = true;
  evidence.githubActionsArtifactLongTermDestination = true;
  const result = validateDatabaseBackupEvidence(evidence);
  assert.ok(
    result.findings.includes('connection-mode-must-be-direct-or-session-pooler'),
  );
  assert.ok(
    result.findings.includes('sameSupabaseProjectDestination-must-be-false'),
  );
  assert.ok(result.findings.includes('repositoryDestination-must-be-false'));
  assert.ok(
    result.findings.includes(
      'githubActionsArtifactLongTermDestination-must-be-false',
    ),
  );
});

test('requires all dump artifacts and checksum validation', () => {
  const evidence = validEvidence();
  evidence.rolesDumpCreated = false;
  evidence.schemaChecksumVerified = false;
  evidence.dataUsedCopy = false;
  const result = validateDatabaseBackupEvidence(evidence);
  assert.ok(result.findings.includes('rolesDumpCreated-must-be-true'));
  assert.ok(result.findings.includes('schemaChecksumVerified-must-be-true'));
  assert.ok(result.findings.includes('dataUsedCopy-must-be-true'));
});

test('rejects insufficient retention frequency and invalid sizes', () => {
  const evidence = validEvidence();
  evidence.retentionDays = 34;
  evidence.frequencyHours = 25;
  evidence.dataSizeBytes = 0;
  const result = validateDatabaseBackupEvidence(evidence);
  assert.ok(result.findings.includes('retention-days-must-be-at-least-35'));
  assert.ok(
    result.findings.includes('frequency-hours-must-be-between-1-and-24'),
  );
  assert.ok(result.findings.includes('dataSizeBytes-must-be-positive-integer'));
});

test('rejects exposed credentials and sensitive values', () => {
  const evidence = validEvidence();
  evidence.databaseUrlExposed = true;
  evidence.notes = 'postgresql://example.invalid';
  const result = validateDatabaseBackupEvidence(evidence);
  assert.ok(result.findings.includes('databaseUrlExposed-must-be-false'));
  assert.ok(result.findings.includes('sensitive-backup-value:notes'));
});

test('rejects invalid timestamp environment and missing field', () => {
  const evidence = validEvidence();
  evidence.completedAt = 'invalid';
  evidence.environment = 'Local';
  delete evidence.evidenceId;
  const result = validateDatabaseBackupEvidence(evidence);
  assert.ok(result.findings.includes('invalid-timestamp:completedAt'));
  assert.ok(result.findings.includes('environment-must-be-staging-or-production'));
  assert.ok(result.findings.includes('required-field-missing:evidenceId'));
});
