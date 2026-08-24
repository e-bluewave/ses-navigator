import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRestoreDrillPolicy } from './check-restore-drill-policy.mjs';

const policy = {
  version: 1,
  scope: 'database-storage-restore-drill',
  target: { separateEnvironmentRequired: true, productionDirectRestoreAllowed: false, disposableOrDedicatedStagingTargetRequired: true },
  database: { backupTrackedBy: 'BA-006', rolesRequired: true, schemaRequired: true, dataRequired: true, singleTransactionRequired: true, onErrorStopRequired: true },
  storage: { backupTrackedBy: 'BA-007', objectsRequired: true, bucketAndObjectKeyPreservationRequired: true, integrityVerificationRequired: true },
  validation: { databaseAndStorageSameRecoveryPointRequired: true, applicationSmokeRequired: true, authSmokeRequired: true, dataApiSecurityRegressionRequired: true, objectInventoryComparisonRequired: true },
  drill: { maximumIntervalDays: 90, namedPrimaryOwnerRequired: true, namedBackupOwnerRequired: true, evidenceRequired: true, actualDurationRequired: true, failureFollowupRequired: true },
  security: { productionSecretsReuseAllowed: false, credentialsInRepositoryAllowed: false, credentialsInLogsAllowed: false, restoredSensitiveDataPublicExposureAllowed: false },
};

test('accepts the reviewed restore drill policy', () => {
  const result = validateRestoreDrillPolicy(policy);
  assert.equal(result.status, 'RESTORE_DRILL_POLICY_PASSED');
  assert.deepEqual(result.failures, []);
});

test('rejects Production restore and weak DB restore controls', () => {
  const result = validateRestoreDrillPolicy({
    ...policy,
    target: { ...policy.target, productionDirectRestoreAllowed: true },
    database: { ...policy.database, singleTransactionRequired: false, onErrorStopRequired: false },
  });
  assert.ok(result.failures.includes('direct Production restore drill must be prohibited'));
  assert.ok(result.failures.includes('database restore must use a single transaction'));
  assert.ok(result.failures.includes('database restore must stop on error'));
});

test('requires coordinated DB and Storage validation', () => {
  const result = validateRestoreDrillPolicy({
    ...policy,
    storage: { ...policy.storage, integrityVerificationRequired: false },
    validation: { ...policy.validation, databaseAndStorageSameRecoveryPointRequired: false, dataApiSecurityRegressionRequired: false },
  });
  assert.ok(result.failures.includes('storage integrity verification is required'));
  assert.ok(result.failures.includes('DB and Storage recovery point coordination is required'));
  assert.ok(result.failures.includes('Data API security regression is required'));
});

test('rejects drills older than 90 days and unsafe secrets', () => {
  const result = validateRestoreDrillPolicy({
    ...policy,
    drill: { ...policy.drill, maximumIntervalDays: 120 },
    security: { ...policy.security, productionSecretsReuseAllowed: true, credentialsInLogsAllowed: true },
  });
  assert.ok(result.failures.includes('restore drill interval must be between 1 and 90 days'));
  assert.ok(result.failures.includes('Production secrets reuse must be prohibited'));
  assert.ok(result.failures.includes('restore credentials must not be allowed in logs'));
});
