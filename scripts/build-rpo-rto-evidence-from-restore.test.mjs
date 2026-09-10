import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBa009Evidence,
  runBa009EvidenceAssembler,
  validateBa009GovernanceFacts,
} from './build-rpo-rto-evidence-from-restore.mjs';

const governance = {
  businessOwnerApproved: true,
  technicalOwnerApproved: true,
  targetsAcknowledged: true,
  annualReviewScheduled: true,
  exceptionUsed: false,
};

const restoreEvidence = {
  evidenceId: 'BA-008-TEST',
  environment: 'Disposable',
  startedAt: '2026-09-10T00:00:00.000Z',
  completedAt: '2026-09-10T00:10:00.000Z',
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
  rtoMinutesMeasured: 120,
  recoveryPointAgeMinutesMeasured: 30,
  followUpRequired: false,
  secretOrPersonalDataExposed: false,
  secretFreeEvidence: true,
};

const policy = {
  tiers: {
    tier1: { rpoMinutes: 60, rtoMinutes: 240 },
    tier2: { rpoMinutes: 240, rtoMinutes: 480 },
    tier3: { rpoMinutes: 1440, rtoMinutes: 1440 },
  },
};

test('accepts approval booleans without owner names', () => {
  const result = validateBa009GovernanceFacts(governance);
  assert.equal(result.complete, true);
});

test('rejects governance fields that could leak owner identity', () => {
  const result = validateBa009GovernanceFacts({
    ...governance,
    businessOwnerName: 'Example Person',
  });
  assert.equal(result.complete, false);
  assert.ok(result.findings.includes('unknown-field:businessOwnerName'));
});

test('copies one BA-008 measurement set to all BA-009 tiers', () => {
  const evidence = buildBa009Evidence({
    restoreEvidence,
    governance,
    completedAt: '2026-09-10T01:00:00.000Z',
  });
  assert.equal(evidence.tier1RpoMinutesMeasured, 30);
  assert.equal(evidence.tier2RpoMinutesMeasured, 30);
  assert.equal(evidence.tier3RpoMinutesMeasured, 30);
  assert.equal(evidence.tier1RtoMinutesMeasured, 120);
  assert.equal(evidence.tier2RtoMinutesMeasured, 120);
  assert.equal(evidence.tier3RtoMinutesMeasured, 120);
});

test('writes READY evidence when BA-008 measurements meet all targets', async () => {
  const files = new Map([
    ['restore.json', JSON.stringify(restoreEvidence)],
    ['governance.json', JSON.stringify(governance)],
    ['policy.json', JSON.stringify(policy)],
  ]);
  let written = '';
  const result = await runBa009EvidenceAssembler({
    restoreEvidencePath: 'restore.json',
    governanceFactsPath: 'governance.json',
    outputPath: 'ba009.json',
    policyPath: 'policy.json',
    now: () => '2026-09-10T01:00:00.000Z',
    readFileImpl: async (path) => files.get(path),
    writeFileImpl: async (_path, text) => {
      written = text;
    },
    log: () => {},
  });
  assert.equal(result.status, 'BA009_EVIDENCE_READY');
  assert.match(written, /"restoreDrillEvidencePassed": true/u);
});

test('writes evidence but fails closed when a target is exceeded', async () => {
  const slowRestore = {
    ...restoreEvidence,
    rtoMinutesMeasured: 500,
    recoveryPointAgeMinutesMeasured: 90,
    followUpRequired: true,
    followUpReferencePresent: true,
  };
  const files = new Map([
    ['restore.json', JSON.stringify(slowRestore)],
    ['governance.json', JSON.stringify(governance)],
    ['policy.json', JSON.stringify(policy)],
  ]);
  let written = '';
  await assert.rejects(
    () =>
      runBa009EvidenceAssembler({
        restoreEvidencePath: 'restore.json',
        governanceFactsPath: 'governance.json',
        outputPath: 'ba009.json',
        policyPath: 'policy.json',
        now: () => '2026-09-10T01:00:00.000Z',
        readFileImpl: async (path) => files.get(path),
        writeFileImpl: async (_path, text) => {
          written = text;
        },
        log: () => {},
      }),
    /BA-009 remains blocked/u,
  );
  assert.match(written, /"tier1RtoMinutesMeasured": 500/u);
});

test('does not allow exception metadata to turn a target miss into PASS', async () => {
  const slowRestore = {
    ...restoreEvidence,
    rtoMinutesMeasured: 500,
    recoveryPointAgeMinutesMeasured: 90,
    followUpRequired: true,
    followUpReferencePresent: true,
  };
  const exceptionGovernance = {
    ...governance,
    exceptionUsed: true,
    exceptionApprovalPresent: true,
    exceptionExpiryPresent: true,
  };
  const files = new Map([
    ['restore.json', JSON.stringify(slowRestore)],
    ['governance.json', JSON.stringify(exceptionGovernance)],
    ['policy.json', JSON.stringify(policy)],
  ]);
  await assert.rejects(
    () =>
      runBa009EvidenceAssembler({
        restoreEvidencePath: 'restore.json',
        governanceFactsPath: 'governance.json',
        outputPath: 'ba009.json',
        policyPath: 'policy.json',
        now: () => '2026-09-10T01:00:00.000Z',
        readFileImpl: async (path) => files.get(path),
        writeFileImpl: async () => {},
        log: () => {},
      }),
    /BA-009 remains blocked/u,
  );
});
