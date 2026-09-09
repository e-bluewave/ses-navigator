import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeTargetProbeFacts } from './restore-drill-local-preflight.mjs';

const baseFacts = {
  version: 1,
  productionSecretsReused: false,
  databaseBackupRunLinked: true,
  storageBackupRunLinked: true,
  restorePointAlignment: 'PASS',
  migrationBaselineRecorded: true,
  applicationSchemaBaselineRecorded: true,
  restoreCommandSingleTransaction: true,
  restoreCommandOnErrorStop: true,
  artifactCopyHashParity: 'PASS',
  customRoleCount: 0,
  roleReplayMode: 'intentional-skip-empty-custom-set',
  reservedRoleReplayPlanned: false,
  storageRestoreViaApiOrS3Planned: true,
  storageProtectDeleteDisablePlanned: false,
  falsePassGuardReady: true,
  secretFreeFacts: true,
};

const passedProbe = {
  status: 'RESTORE_TARGET_PROBE_PASSED',
  complete: true,
  findings: [],
  probe: {
    version: 1,
    mode: 'local-docker-supabase',
    environment: 'Disposable',
    productionTarget: false,
    separateRestoreEnvironment: true,
    targetIdentityVerified: true,
    targetDefaultAclNormalized: true,
    databaseReachable: true,
    localDockerContainer: true,
    supabasePostgresImage: true,
    requiredNameTokenMatched: true,
    riskyDefaultAclEntryCount: 0,
    postgresMajorVersion: 17,
    secretFreeProbe: true,
  },
};

test('machine target probe supplies local target safety facts', () => {
  const result = mergeTargetProbeFacts(baseFacts, passedProbe);
  assert.deepEqual(result.findings, []);
  assert.equal(result.facts.environment, 'Disposable');
  assert.equal(result.facts.productionTarget, false);
  assert.equal(result.facts.separateRestoreEnvironment, true);
  assert.equal(result.facts.targetIdentityVerified, true);
  assert.equal(result.facts.targetDefaultAclNormalized, true);
});

test('rejects facts that conflict with machine target probe', () => {
  const result = mergeTargetProbeFacts(
    { ...baseFacts, targetDefaultAclNormalized: false },
    passedProbe,
  );
  assert.equal(result.facts, null);
  assert.deepEqual(result.findings, [
    'target-probe-facts-conflict:targetDefaultAclNormalized',
  ]);
});

test('requires a passed secret-free target probe', () => {
  const result = mergeTargetProbeFacts(baseFacts, {
    ...passedProbe,
    status: 'RESTORE_TARGET_PROBE_FAILED',
    complete: false,
  });
  assert.equal(result.facts, null);
  assert.deepEqual(result.findings, [
    'passed-secret-free-target-probe-required',
  ]);
});
