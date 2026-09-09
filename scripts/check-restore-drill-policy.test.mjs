import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRestoreDrillPolicy } from './check-restore-drill-policy.mjs';

const policy = {
  version: 2,
  scope: 'database-storage-restore-drill',
  target: {
    separateEnvironmentRequired: true,
    productionDirectRestoreAllowed: false,
    disposableOrDedicatedStagingTargetRequired: true,
    targetIdentityVerificationRequired: true,
  },
  database: {
    backupTrackedBy: 'BA-006',
    rolesRequired: true,
    schemaRequired: true,
    dataRequired: true,
    singleTransactionRequired: true,
    onErrorStopRequired: true,
    reservedManagedRolesReplayAllowed: false,
    emptyCustomRoleSetMaySkipRoleReplay: true,
    targetDefaultAclNormalizationRequired: true,
    storageManagedSchemaSqlRestoreAllowed: false,
    migrationBaselineEvidenceRequired: true,
  },
  storage: {
    backupTrackedBy: 'BA-007',
    objectsRequired: true,
    bucketAndObjectKeyPreservationRequired: true,
    integrityVerificationRequired: true,
    restoreViaApiOrS3Required: true,
    managedMetadataSqlRestoreAllowed: false,
    protectDeleteDisableAllowed: false,
    ghostMetadataCleanupViaStorageApiRequired: true,
  },
  preflight: {
    machineValidatedGateRequired: true,
    secretFreeFactsRequired: true,
    artifactEncodingInspectionRequired: true,
    storageSqlContaminationCheckRequired: true,
    roleClassificationRequired: true,
    defaultAclConfirmationRequired: true,
    migrationBaselineConfirmationRequired: true,
    restoreCommandSafetyConfirmationRequired: true,
    dependencyReadinessCheckRequired: true,
    falsePassGuardConfirmationRequired: true,
  },
  validation: {
    databaseAndStorageSameRecoveryPointRequired: true,
    applicationSmokeRequired: true,
    authSmokeRequired: true,
    dataApiSecurityRegressionRequired: true,
    objectInventoryComparisonRequired: true,
    strictUtf8NoBomEvidenceRequired: true,
    processExitCodeAuthoritative: true,
    applicationDependenciesReadyBeforeSmokeRequired: true,
    falsePassGuardRequired: true,
  },
  drill: {
    maximumIntervalDays: 90,
    namedPrimaryOwnerRequired: true,
    namedBackupOwnerRequired: true,
    evidenceRequired: true,
    actualDurationRequired: true,
    failureFollowupRequired: true,
    measuredRpoRequired: true,
    measuredRtoRequired: true,
    atomicShellExecutionRequired: true,
  },
  security: {
    productionSecretsReuseAllowed: false,
    credentialsInRepositoryAllowed: false,
    credentialsInLogsAllowed: false,
    restoredSensitiveDataPublicExposureAllowed: false,
  },
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
    database: {
      ...policy.database,
      singleTransactionRequired: false,
      onErrorStopRequired: false,
    },
  });
  assert.ok(
    result.failures.includes(
      'direct Production restore drill must be prohibited',
    ),
  );
  assert.ok(
    result.failures.includes('database restore must use a single transaction'),
  );
  assert.ok(result.failures.includes('database restore must stop on error'));
});

test('requires coordinated DB and Storage validation', () => {
  const result = validateRestoreDrillPolicy({
    ...policy,
    storage: { ...policy.storage, integrityVerificationRequired: false },
    validation: {
      ...policy.validation,
      databaseAndStorageSameRecoveryPointRequired: false,
      dataApiSecurityRegressionRequired: false,
    },
  });
  assert.ok(
    result.failures.includes('storage integrity verification is required'),
  );
  assert.ok(
    result.failures.includes(
      'DB and Storage recovery point coordination is required',
    ),
  );
  assert.ok(
    result.failures.includes('Data API security regression is required'),
  );
});

test('rejects drills older than 90 days and unsafe secrets', () => {
  const result = validateRestoreDrillPolicy({
    ...policy,
    drill: { ...policy.drill, maximumIntervalDays: 120 },
    security: {
      ...policy.security,
      productionSecretsReuseAllowed: true,
      credentialsInLogsAllowed: true,
    },
  });
  assert.ok(
    result.failures.includes(
      'restore drill interval must be between 1 and 90 days',
    ),
  );
  assert.ok(
    result.failures.includes('Production secrets reuse must be prohibited'),
  );
  assert.ok(
    result.failures.includes('restore credentials must not be allowed in logs'),
  );
});

test('requires the machine-validated fail-closed preflight gate', () => {
  const result = validateRestoreDrillPolicy({
    ...policy,
    preflight: {
      machineValidatedGateRequired: false,
      secretFreeFactsRequired: false,
      artifactEncodingInspectionRequired: false,
      storageSqlContaminationCheckRequired: false,
      roleClassificationRequired: false,
      defaultAclConfirmationRequired: false,
      migrationBaselineConfirmationRequired: false,
      restoreCommandSafetyConfirmationRequired: false,
      dependencyReadinessCheckRequired: false,
      falsePassGuardConfirmationRequired: false,
    },
  });

  for (const message of [
    'machine-validated restore preflight is required',
    'restore preflight facts must be secret-free',
    'restore preflight artifact encoding inspection is required',
    'restore preflight Storage SQL contamination check is required',
    'restore preflight role classification is required',
    'restore preflight default ACL confirmation is required',
    'restore preflight migration baseline confirmation is required',
    'restore preflight command safety confirmation is required',
    'restore preflight dependency readiness check is required',
    'restore preflight false PASS guard confirmation is required',
  ]) {
    assert.ok(result.failures.includes(message));
  }
});

test('requires BA-008 hardening controls learned from the restore drill', () => {
  const result = validateRestoreDrillPolicy({
    ...policy,
    target: { ...policy.target, targetIdentityVerificationRequired: false },
    database: {
      ...policy.database,
      reservedManagedRolesReplayAllowed: true,
      targetDefaultAclNormalizationRequired: false,
      storageManagedSchemaSqlRestoreAllowed: true,
      migrationBaselineEvidenceRequired: false,
    },
    storage: {
      ...policy.storage,
      restoreViaApiOrS3Required: false,
      managedMetadataSqlRestoreAllowed: true,
      protectDeleteDisableAllowed: true,
      ghostMetadataCleanupViaStorageApiRequired: false,
    },
    validation: {
      ...policy.validation,
      strictUtf8NoBomEvidenceRequired: false,
      processExitCodeAuthoritative: false,
      applicationDependenciesReadyBeforeSmokeRequired: false,
      falsePassGuardRequired: false,
    },
    drill: {
      ...policy.drill,
      measuredRpoRequired: false,
      measuredRtoRequired: false,
      atomicShellExecutionRequired: false,
    },
  });

  assert.ok(
    result.failures.includes(
      'restore target identity verification is required',
    ),
  );
  assert.ok(
    result.failures.includes(
      'Supabase managed reserved roles must not be replayed',
    ),
  );
  assert.ok(
    result.failures.includes(
      'target default ACL normalization is required before schema restore',
    ),
  );
  assert.ok(
    result.failures.includes(
      'Storage managed schema SQL restore must be prohibited',
    ),
  );
  assert.ok(
    result.failures.includes('migration baseline evidence is required'),
  );
  assert.ok(
    result.failures.includes(
      'Storage restore must use Storage API or S3-compatible API',
    ),
  );
  assert.ok(
    result.failures.includes(
      'Storage managed metadata SQL restore must be prohibited',
    ),
  );
  assert.ok(
    result.failures.includes(
      'storage.protect_delete must not be disabled for restore',
    ),
  );
  assert.ok(
    result.failures.includes(
      'ghost Storage metadata cleanup must use Storage API',
    ),
  );
  assert.ok(
    result.failures.includes(
      'restore evidence must use strict UTF-8 without BOM',
    ),
  );
  assert.ok(
    result.failures.includes('restore process exit code must be authoritative'),
  );
  assert.ok(
    result.failures.includes(
      'application dependencies must be ready before smoke validation',
    ),
  );
  assert.ok(result.failures.includes('false PASS guard is required'));
  assert.ok(result.failures.includes('measured restore-point age is required'));
  assert.ok(
    result.failures.includes('measured business-usable RTO is required'),
  );
  assert.ok(
    result.failures.includes('restore shell samples must fail atomically'),
  );
});
