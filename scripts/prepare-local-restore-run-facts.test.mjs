import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRunFacts,
  deriveRecoveryPointFacts,
  runPrepareLocalRestoreRunFacts,
  validatePreparationInput,
} from './prepare-local-restore-run-facts.mjs';

function validDatabaseEvidence(overrides = {}) {
  return {
    evidenceId: 'BA006-TEST',
    environment: 'Production',
    startedAt: '2026-09-10T00:00:00.000Z',
    completedAt: '2026-09-10T00:05:00.000Z',
    postgresMajorVersion: 17,
    rolesDumpCreated: true,
    schemaDumpCreated: true,
    dataDumpCreated: true,
    dataUsedCopy: true,
    rolesSizeBytes: 1,
    schemaSizeBytes: 1,
    dataSizeBytes: 1,
    rolesChecksumVerified: true,
    schemaChecksumVerified: true,
    dataChecksumVerified: true,
    migrationBaselineRecorded: true,
    migrationBaselineMethod: 'repository-migration-head',
    applicationSchemaBaselineRecorded: true,
    storageManagedSchemaExcluded: true,
    connectionMode: 'direct',
    offsiteDestinationConfirmed: true,
    sameSupabaseProjectDestination: false,
    repositoryDestination: false,
    githubActionsArtifactLongTermDestination: false,
    tlsInTransit: true,
    encryptedAtRest: true,
    retentionDays: 35,
    frequencyHours: 1,
    manifestCreated: true,
    secretExposureReview: 'PASS',
    databaseUrlExposed: false,
    databasePasswordExposed: false,
    secretFreeEvidence: true,
    ...overrides,
  };
}

function validStorageEvidence(overrides = {}) {
  return {
    evidenceId: 'BA007-TEST',
    environment: 'Production',
    startedAt: '2026-09-10T00:02:00.000Z',
    completedAt: '2026-09-10T00:06:00.000Z',
    allFileBucketsIncluded: true,
    bucketAndObjectKeyPreserved: true,
    sourceObjectCount: 1,
    backedUpObjectCount: 1,
    sourceTotalBytes: 10,
    backedUpTotalBytes: 10,
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
    frequencyHours: 1,
    sourceDeletionPropagatesImmediately: false,
    dedicatedBackupCredentialUsed: true,
    databaseBackupRunLinked: true,
    databaseRecoveryPointRecorded: true,
    storageRecoveryPointRecorded: true,
    recoveryPointSkewMinutesMeasured: 2,
    jointRecoveryPointEstablished: true,
    credentialExposed: false,
    objectDataExposed: false,
    secretFreeEvidence: true,
    ...overrides,
  };
}

function validPreparation(overrides = {}) {
  return {
    repoRoot: 'D:/repo',
    databaseBackupEvidencePath: 'private/db-evidence.json',
    storageBackupEvidencePath: 'private/storage-evidence.json',
    followUpReferencePresent: true,
    db: {
      factsPath: 'private/preflight.json',
      rolesPath: 'private/roles.sql',
      schemaPath: 'private/schema.sql',
      dataPath: 'private/data.sql',
      containerName: 'supabase_db_restore',
      requiredNameToken: 'restore',
    },
    storage: {
      manifestPath: 'private/storage-manifest.json',
      sourceRoot: 'private/storage-snapshot',
      cleanupExisting: true,
    },
    notes: 'private operational note',
    ...overrides,
  };
}

test('accepts minimal preparation input with local paths only', () => {
  const result = validatePreparationInput(validPreparation());
  assert.equal(result.complete, true);
});

test('derives conservative recovery points and verifies recorded skew', () => {
  const result = deriveRecoveryPointFacts(
    validDatabaseEvidence(),
    validStorageEvidence(),
  );
  assert.equal(result.complete, true);
  assert.equal(result.databaseRecoveryPointAt, '2026-09-10T00:00:00.000Z');
  assert.equal(result.storageRecoveryPointAt, '2026-09-10T00:02:00.000Z');
  assert.equal(result.recoveryPointSkewMinutesCalculated, 2);
  assert.equal(result.restorePointAlignment, 'PASS');
});

test('fails when BA-007 recorded skew does not match the linked BA-006 evidence', () => {
  const result = deriveRecoveryPointFacts(
    validDatabaseEvidence(),
    validStorageEvidence({ recoveryPointSkewMinutesMeasured: 0 }),
  );
  assert.equal(result.complete, false);
  assert.ok(
    result.findings.includes('recovery-point-skew-does-not-match-evidence'),
  );
});

test('fails when DB and Storage backup environments differ', () => {
  const result = deriveRecoveryPointFacts(
    validDatabaseEvidence({ environment: 'Staging' }),
    validStorageEvidence({ environment: 'Production' }),
  );
  assert.equal(result.complete, false);
  assert.ok(result.findings.includes('backup-environments-must-match'));
});

test('builds Disposable run facts without copying backup evidence IDs', () => {
  const recovery = deriveRecoveryPointFacts(
    validDatabaseEvidence(),
    validStorageEvidence(),
  );
  const runFacts = buildRunFacts(validPreparation(), recovery);
  assert.equal(runFacts.environment, 'Disposable');
  assert.equal(runFacts.databaseBackupRunLinked, true);
  assert.equal(runFacts.storageBackupRunLinked, true);
  assert.equal(runFacts.restorePointAlignment, 'PASS');
  assert.equal('evidenceId' in runFacts, false);
});

test('writes run facts only after both backup evidence documents validate', async () => {
  const preparation = validPreparation();
  const files = new Map([
    ['prep.json', JSON.stringify(preparation)],
    [
      preparation.databaseBackupEvidencePath,
      JSON.stringify(validDatabaseEvidence()),
    ],
    [
      preparation.storageBackupEvidencePath,
      JSON.stringify(validStorageEvidence()),
    ],
  ]);
  let written = '';
  const result = await runPrepareLocalRestoreRunFacts({
    preparationPath: 'prep.json',
    outputPath: 'run-facts.json',
    readFileImpl: async (path) => files.get(path),
    writeFileImpl: async (_path, text) => {
      written = text;
    },
    log: () => {},
  });
  assert.equal(result.status, 'RESTORE_RUN_FACTS_PREPARED');
  assert.match(
    written,
    /"databaseRecoveryPointAt": "2026-09-10T00:00:00.000Z"/u,
  );
  assert.match(
    written,
    /"storageRecoveryPointAt": "2026-09-10T00:02:00.000Z"/u,
  );
});

test('does not write run facts when recovery linkage fails', async () => {
  const preparation = validPreparation();
  const files = new Map([
    ['prep.json', JSON.stringify(preparation)],
    [
      preparation.databaseBackupEvidencePath,
      JSON.stringify(validDatabaseEvidence()),
    ],
    [
      preparation.storageBackupEvidencePath,
      JSON.stringify(
        validStorageEvidence({ jointRecoveryPointEstablished: false }),
      ),
    ],
  ]);
  let writes = 0;
  await assert.rejects(
    () =>
      runPrepareLocalRestoreRunFacts({
        preparationPath: 'prep.json',
        outputPath: 'run-facts.json',
        readFileImpl: async (path) => files.get(path),
        writeFileImpl: async () => {
          writes += 1;
        },
        log: () => {},
      }),
    /Recovery point derivation failed/u,
  );
  assert.equal(writes, 0);
});
