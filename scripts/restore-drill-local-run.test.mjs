import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRestoreDrillEvidence } from './check-restore-drill-evidence.mjs';
import {
  buildRestoreDrillEvidence,
  calculateRestoreTimeline,
  evaluateRestoreTargets,
  runLocalRestoreDrill,
  validateLocalRestoreRunFacts,
} from './restore-drill-local-run.mjs';

test('run facts require linked backups, recovery points and verified parity facts', () => {
  const result = validateLocalRestoreRunFacts(baseFacts());
  assert.equal(result.complete, true);

  const failed = validateLocalRestoreRunFacts({
    ...baseFacts(),
    databaseBackupRunLinked: false,
    migrationParity: 'FAIL',
  });
  assert.equal(failed.complete, false);
  assert.ok(failed.findings.includes('databaseBackupRunLinked-must-be-true'));
  assert.ok(failed.findings.includes('migrationParity-must-pass'));
});

test('timeline chooses the older DB/Storage point and stops RTO at business usability', () => {
  const result = calculateRestoreTimeline({
    startedAt: '2026-09-09T00:00:00.000Z',
    businessUsableAt: '2026-09-09T00:03:30.000Z',
    databaseRecoveryPointAt: '2026-09-08T23:20:00.000Z',
    storageRecoveryPointAt: '2026-09-08T23:40:00.000Z',
  });
  assert.equal(result.jointRecoveryPointAt, '2026-09-08T23:20:00.000Z');
  assert.equal(result.recoveryPointAgeMinutesMeasured, 40);
  assert.equal(result.rtoMinutesMeasured, 3.5);
});

test('tier evaluation requires follow-up when Tier 1 or Tier 2 misses', () => {
  const pass = evaluateRestoreTargets({
    recoveryPointAgeMinutesMeasured: 30,
    rtoMinutesMeasured: 120,
  });
  assert.equal(pass.followUpRequired, false);
  assert.deepEqual(pass.tiers.tier1, { rpo: 'PASS', rto: 'PASS' });

  const miss = evaluateRestoreTargets({
    recoveryPointAgeMinutesMeasured: 84.15,
    rtoMinutesMeasured: 600,
  });
  assert.equal(miss.followUpRequired, true);
  assert.deepEqual(miss.tiers.tier1, { rpo: 'FAIL', rto: 'FAIL' });
  assert.deepEqual(miss.tiers.tier2, { rpo: 'PASS', rto: 'FAIL' });
  assert.deepEqual(miss.tiers.tier3, { rpo: 'PASS', rto: 'PASS' });
});

test('assembled evidence maps verified DB Storage Auth App Data API and RLS results', () => {
  const assembled = buildRestoreDrillEvidence({
    facts: { ...baseFacts(), followUpReferencePresent: false },
    startedAt: '2026-09-09T00:00:00.000Z',
    businessUsableAt: '2026-09-09T00:03:00.000Z',
    completedAt: '2026-09-09T00:04:00.000Z',
    dbResult: passedDbResult(),
    storageResult: passedStorageResult(),
    liveResult: passedLiveResult(),
  });

  assert.equal(assembled.evidence.rolesRestore, 'PASS');
  assert.equal(assembled.evidence.rlsTenantIsolation, 'PASS');
  assert.equal(assembled.evidence.rtoMinutesMeasured, 3);
  const validation = validateRestoreDrillEvidence(assembled.evidence);
  assert.equal(validation.complete, true, validation.findings.join(', '));
});

test('unexpected role replay mode is not converted to PASS', () => {
  assert.throws(
    () =>
      buildRestoreDrillEvidence({
        facts: { ...baseFacts(), followUpReferencePresent: false },
        startedAt: '2026-09-09T00:00:00.000Z',
        businessUsableAt: '2026-09-09T00:03:00.000Z',
        completedAt: '2026-09-09T00:04:00.000Z',
        dbResult: { ...passedDbResult(), customRoleReplay: 'UNKNOWN' },
        storageResult: passedStorageResult(),
        liveResult: passedLiveResult(),
      }),
    /role replay/u,
  );
});

test('target miss fails closed unless a follow-up reference is recorded', () => {
  const facts = {
    ...baseFacts(),
    databaseRecoveryPointAt: '2026-09-08T22:00:00.000Z',
    storageRecoveryPointAt: '2026-09-08T22:10:00.000Z',
    followUpReferencePresent: false,
  };
  assert.throws(
    () =>
      buildRestoreDrillEvidence({
        facts,
        startedAt: '2026-09-09T00:00:00.000Z',
        businessUsableAt: '2026-09-09T10:00:00.000Z',
        completedAt: '2026-09-09T10:01:00.000Z',
        dbResult: passedDbResult(),
        storageResult: passedStorageResult(),
        liveResult: passedLiveResult(),
      }),
    /follow-up reference/u,
  );
});

test('orchestrator runs DB then Storage then live validation and writes BOM-free valid evidence', async () => {
  const calls = [];
  const facts = { ...baseFacts(), followUpReferencePresent: false };
  const nowValues = [
    Date.parse('2026-09-09T00:00:00.000Z'),
    Date.parse('2026-09-09T00:03:00.000Z'),
    Date.parse('2026-09-09T00:04:00.000Z'),
  ];
  let written = null;

  const result = await runLocalRestoreDrill({
    runFactsPath: 'private-run-facts.json',
    outputPath: 'private-evidence.json',
    readFileImpl: async () => JSON.stringify(facts),
    writeFileImpl: async (_path, text, encoding) => {
      written = { text, encoding };
    },
    now: () => nowValues.shift(),
    runDbRestore: async () => {
      calls.push('db');
      return passedDbResult();
    },
    runStorageRestore: async () => {
      calls.push('storage');
      return passedStorageResult();
    },
    runLiveValidation: async () => {
      calls.push('live');
      return passedLiveResult();
    },
    log: () => {},
  });

  assert.deepEqual(calls, ['db', 'storage', 'live']);
  assert.equal(result.status, 'LOCAL_RESTORE_DRILL_PASSED');
  assert.equal(result.rtoMinutes, 3);
  assert.equal(written.encoding, 'utf8');
  assert.notEqual(written.text.charCodeAt(0), 0xfeff);
  const validation = validateRestoreDrillEvidence(JSON.parse(written.text));
  assert.equal(validation.complete, true, validation.findings.join(', '));
});

function baseFacts() {
  return {
    environment: 'Disposable',
    repoRoot: '.',
    databaseRecoveryPointAt: '2026-09-08T23:30:00.000Z',
    storageRecoveryPointAt: '2026-09-08T23:40:00.000Z',
    databaseBackupRunLinked: true,
    storageBackupRunLinked: true,
    restorePointAlignment: 'PASS',
    migrationParity: 'PASS',
    deletionTombstonesReapplied: 'PASS',
    db: {
      factsPath: 'db-facts.json',
      rolesPath: 'roles.sql',
      schemaPath: 'schema.sql',
      dataPath: 'data.sql',
      containerName: 'sesn-restore-db',
      requiredNameToken: 'restore',
    },
    storage: {
      manifestPath: 'storage-manifest.json',
      sourceRoot: 'storage-snapshot',
      cleanupExisting: true,
    },
  };
}

function passedDbResult() {
  return {
    complete: true,
    customRoleReplay: 'INTENTIONAL_SKIP_EMPTY_CUSTOM_SET',
    schemaRestore: 'PASS',
    dataRestore: 'PASS',
    databaseRestoreTransactional: true,
    databaseOnErrorStop: true,
  };
}

function passedStorageResult() {
  return {
    complete: true,
    storageRestore: 'PASS',
    storageObjectCountParity: 'PASS',
    storageTotalBytesParity: 'PASS',
    storageIntegrityVerification: 'PASS',
    storageInventoryVerification: 'PASS',
    representativeFileRead: 'PASS',
    businessFileRestoreClaimed: false,
  };
}

function passedLiveResult() {
  return {
    complete: true,
    authSmokeTest: 'PASS',
    applicationSmokeTest: 'PASS',
    dataApiSecurityRegression: 'PASS',
    rlsTenantIsolation: 'PASS',
  };
}
