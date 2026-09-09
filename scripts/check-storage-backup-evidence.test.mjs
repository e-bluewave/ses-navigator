import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateStorageBackupEvidence,
  validateStorageBackupEvidenceText,
} from './check-storage-backup-evidence.mjs';

function validEvidence() {
  return {
    evidenceId: 'BA007-STORAGE-BACKUP-20260905-01',
    environment: 'Staging',
    startedAt: '2026-09-05T07:55:00+09:00',
    completedAt: '2026-09-05T08:00:00+09:00',
    allFileBucketsIncluded: true,
    bucketAndObjectKeyPreserved: true,
    sourceObjectCount: 100,
    backedUpObjectCount: 100,
    sourceTotalBytes: 1048576,
    backedUpTotalBytes: 1048576,
    transferErrorCount: 0,
    allTransferErrorsRetried: true,
    integrityVerification: 'checksum',
    manifestCreated: true,
    offsiteDestinationConfirmed: true,
    sameSupabaseProjectDestination: false,
    repositoryDestination: false,
    githubActionsArtifactLongTermDestination: false,
    generationProtectionMode: 'immutable-snapshot',
    generationProtectionVerified: true,
    timestampedSnapshotPrefixUsed: true,
    retentionLockEnabled: true,
    encryptedAtRest: true,
    tlsInTransit: true,
    retentionDays: 35,
    frequencyHours: 24,
    sourceDeletionPropagatesImmediately: false,
    dedicatedBackupCredentialUsed: true,
    databaseBackupRunLinked: true,
    databaseRecoveryPointRecorded: true,
    storageRecoveryPointRecorded: true,
    recoveryPointSkewMinutesMeasured: 15,
    jointRecoveryPointEstablished: true,
    credentialExposed: false,
    objectDataExposed: false,
    secretFreeEvidence: true,
    notes: 'Provider-neutral Staging storage backup evidence.',
  };
}

test('accepts complete BA-007 immutable snapshot evidence', () => {
  const result = validateStorageBackupEvidence(validEvidence());
  assert.equal(result.status, 'STORAGE_BACKUP_EVIDENCE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
});

test('accepts native destination versioning as an alternative generation mode', () => {
  const evidence = validEvidence();
  evidence.generationProtectionMode = 'native-versioning';
  evidence.timestampedSnapshotPrefixUsed = false;
  evidence.retentionLockEnabled = false;
  const result = validateStorageBackupEvidence(evidence);
  assert.equal(result.status, 'STORAGE_BACKUP_EVIDENCE_PASSED');
  assert.deepEqual(result.findings, []);
});

test('requires timestamped prefixes and retention lock for immutable snapshots', () => {
  const evidence = validEvidence();
  evidence.timestampedSnapshotPrefixUsed = false;
  evidence.retentionLockEnabled = false;
  const result = validateStorageBackupEvidence(evidence);
  assert.ok(
    result.findings.includes('immutable-snapshot-requires-timestamped-prefix'),
  );
  assert.ok(
    result.findings.includes('immutable-snapshot-requires-retention-lock'),
  );
});

test('rejects invalid generation protection mode', () => {
  const evidence = validEvidence();
  evidence.generationProtectionMode = 'copy-only';
  const result = validateStorageBackupEvidence(evidence);
  assert.ok(result.findings.includes('generation-protection-mode-invalid'));
});

test('rejects unsafe destination and deletion propagation', () => {
  const evidence = validEvidence();
  evidence.sameSupabaseProjectDestination = true;
  evidence.repositoryDestination = true;
  evidence.githubActionsArtifactLongTermDestination = true;
  evidence.sourceDeletionPropagatesImmediately = true;
  const result = validateStorageBackupEvidence(evidence);
  assert.ok(
    result.findings.includes('sameSupabaseProjectDestination-must-be-false'),
  );
  assert.ok(result.findings.includes('repositoryDestination-must-be-false'));
  assert.ok(
    result.findings.includes(
      'githubActionsArtifactLongTermDestination-must-be-false',
    ),
  );
  assert.ok(
    result.findings.includes(
      'sourceDeletionPropagatesImmediately-must-be-false',
    ),
  );
});

test('requires object count and byte parity', () => {
  const evidence = validEvidence();
  evidence.backedUpObjectCount = 99;
  evidence.backedUpTotalBytes = 100;
  const result = validateStorageBackupEvidence(evidence);
  assert.ok(
    result.findings.includes('source-and-backed-up-object-count-must-match'),
  );
  assert.ok(
    result.findings.includes('source-and-backed-up-total-bytes-must-match'),
  );
});

test('requires measured joint recovery point evidence', () => {
  const evidence = validEvidence();
  evidence.databaseRecoveryPointRecorded = false;
  evidence.storageRecoveryPointRecorded = false;
  evidence.recoveryPointSkewMinutesMeasured = -1;
  evidence.jointRecoveryPointEstablished = false;
  const result = validateStorageBackupEvidence(evidence);
  assert.ok(
    result.findings.includes('databaseRecoveryPointRecorded-must-be-true'),
  );
  assert.ok(
    result.findings.includes('storageRecoveryPointRecorded-must-be-true'),
  );
  assert.ok(
    result.findings.includes(
      'recovery-point-skew-minutes-must-be-non-negative-number',
    ),
  );
  assert.ok(
    result.findings.includes('jointRecoveryPointEstablished-must-be-true'),
  );
});

test('requires transfer errors to be retried', () => {
  const evidence = validEvidence();
  evidence.transferErrorCount = 2;
  evidence.allTransferErrorsRetried = false;
  const result = validateStorageBackupEvidence(evidence);
  assert.ok(result.findings.includes('transfer-errors-must-be-retried'));
});

test('rejects weak retention frequency and invalid integrity method', () => {
  const evidence = validEvidence();
  evidence.retentionDays = 34;
  evidence.frequencyHours = 25;
  evidence.integrityVerification = 'none';
  const result = validateStorageBackupEvidence(evidence);
  assert.ok(result.findings.includes('retention-days-must-be-at-least-35'));
  assert.ok(
    result.findings.includes('frequency-hours-must-be-between-1-and-24'),
  );
  assert.ok(result.findings.includes('integrity-verification-method-invalid'));
});

test('rejects reversed timestamps sensitive values and unknown fields', () => {
  const evidence = validEvidence();
  evidence.completedAt = '2026-09-05T07:50:00+09:00';
  evidence.notes = 'https://example-project.supabase.co';
  evidence.bucketName = 'must-not-be-recorded';
  const result = validateStorageBackupEvidence(evidence);
  assert.ok(
    result.findings.includes('completed-at-must-not-precede-started-at'),
  );
  assert.ok(result.findings.includes('sensitive-storage-value:notes'));
  assert.ok(result.findings.includes('unknown-field:bucketName'));
});

test('rejects BOM and malformed JSON with structured findings', () => {
  const text = JSON.stringify(validEvidence());
  const bomResult = validateStorageBackupEvidenceText(`\uFEFF${text}`);
  const malformedResult = validateStorageBackupEvidenceText('{');
  assert.deepEqual(bomResult.findings, ['utf8-bom-not-allowed']);
  assert.deepEqual(malformedResult.findings, ['invalid-json']);
});
