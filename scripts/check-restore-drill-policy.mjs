import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

export function validateRestoreDrillPolicy(policy) {
  const failures = [];
  const target = policy?.target ?? {};
  const database = policy?.database ?? {};
  const storage = policy?.storage ?? {};
  const preflight = policy?.preflight ?? {};
  const validation = policy?.validation ?? {};
  const drill = policy?.drill ?? {};
  const security = policy?.security ?? {};

  if (policy?.version !== 2) failures.push('policy version must be 2');
  if (policy?.scope !== 'database-storage-restore-drill') {
    failures.push('scope must be database-storage-restore-drill');
  }
  if (target.separateEnvironmentRequired !== true) {
    failures.push('separate restore environment is required');
  }
  if (target.productionDirectRestoreAllowed !== false) {
    failures.push('direct Production restore drill must be prohibited');
  }
  if (target.disposableOrDedicatedStagingTargetRequired !== true) {
    failures.push('dedicated or disposable Staging restore target is required');
  }
  if (target.targetIdentityVerificationRequired !== true) {
    failures.push('restore target identity verification is required');
  }

  if (database.backupTrackedBy !== 'BA-006') {
    failures.push('database backup must be tracked by BA-006');
  }
  if (
    database.rolesRequired !== true ||
    database.schemaRequired !== true ||
    database.dataRequired !== true
  ) {
    failures.push('roles, schema and data restore artifacts are required');
  }
  if (database.singleTransactionRequired !== true) {
    failures.push('database restore must use a single transaction');
  }
  if (database.onErrorStopRequired !== true) {
    failures.push('database restore must stop on error');
  }
  if (database.reservedManagedRolesReplayAllowed !== false) {
    failures.push('Supabase managed reserved roles must not be replayed');
  }
  if (database.emptyCustomRoleSetMaySkipRoleReplay !== true) {
    failures.push(
      'empty custom role set must allow intentional role replay skip',
    );
  }
  if (database.targetDefaultAclNormalizationRequired !== true) {
    failures.push(
      'target default ACL normalization is required before schema restore',
    );
  }
  if (database.storageManagedSchemaSqlRestoreAllowed !== false) {
    failures.push('Storage managed schema SQL restore must be prohibited');
  }
  if (database.migrationBaselineEvidenceRequired !== true) {
    failures.push('migration baseline evidence is required');
  }

  if (storage.backupTrackedBy !== 'BA-007') {
    failures.push('storage backup must be tracked by BA-007');
  }
  if (storage.objectsRequired !== true) {
    failures.push('storage object restore is required');
  }
  if (storage.bucketAndObjectKeyPreservationRequired !== true) {
    failures.push('bucket and object key preservation is required');
  }
  if (storage.integrityVerificationRequired !== true) {
    failures.push('storage integrity verification is required');
  }
  if (storage.restoreViaApiOrS3Required !== true) {
    failures.push('Storage restore must use Storage API or S3-compatible API');
  }
  if (storage.managedMetadataSqlRestoreAllowed !== false) {
    failures.push('Storage managed metadata SQL restore must be prohibited');
  }
  if (storage.protectDeleteDisableAllowed !== false) {
    failures.push('storage.protect_delete must not be disabled for restore');
  }
  if (storage.ghostMetadataCleanupViaStorageApiRequired !== true) {
    failures.push('ghost Storage metadata cleanup must use Storage API');
  }

  for (const [field, message] of [
    [
      'machineValidatedGateRequired',
      'machine-validated restore preflight is required',
    ],
    ['secretFreeFactsRequired', 'restore preflight facts must be secret-free'],
    [
      'artifactEncodingInspectionRequired',
      'restore preflight artifact encoding inspection is required',
    ],
    [
      'storageSqlContaminationCheckRequired',
      'restore preflight Storage SQL contamination check is required',
    ],
    [
      'roleClassificationRequired',
      'restore preflight role classification is required',
    ],
    [
      'defaultAclConfirmationRequired',
      'restore preflight default ACL confirmation is required',
    ],
    [
      'migrationBaselineConfirmationRequired',
      'restore preflight migration baseline confirmation is required',
    ],
    [
      'restoreCommandSafetyConfirmationRequired',
      'restore preflight command safety confirmation is required',
    ],
    [
      'dependencyReadinessCheckRequired',
      'restore preflight dependency readiness check is required',
    ],
    [
      'falsePassGuardConfirmationRequired',
      'restore preflight false PASS guard confirmation is required',
    ],
  ]) {
    if (preflight[field] !== true) failures.push(message);
  }

  if (validation.databaseAndStorageSameRecoveryPointRequired !== true) {
    failures.push('DB and Storage recovery point coordination is required');
  }
  if (validation.applicationSmokeRequired !== true) {
    failures.push('application smoke is required');
  }
  if (validation.authSmokeRequired !== true) {
    failures.push('auth smoke is required');
  }
  if (validation.dataApiSecurityRegressionRequired !== true) {
    failures.push('Data API security regression is required');
  }
  if (validation.objectInventoryComparisonRequired !== true) {
    failures.push('Storage object inventory comparison is required');
  }
  if (validation.strictUtf8NoBomEvidenceRequired !== true) {
    failures.push('restore evidence must use strict UTF-8 without BOM');
  }
  if (validation.processExitCodeAuthoritative !== true) {
    failures.push('restore process exit code must be authoritative');
  }
  if (validation.applicationDependenciesReadyBeforeSmokeRequired !== true) {
    failures.push(
      'application dependencies must be ready before smoke validation',
    );
  }
  if (validation.falsePassGuardRequired !== true) {
    failures.push('false PASS guard is required');
  }

  if (
    !Number.isInteger(drill.maximumIntervalDays) ||
    drill.maximumIntervalDays < 1 ||
    drill.maximumIntervalDays > 90
  ) {
    failures.push('restore drill interval must be between 1 and 90 days');
  }
  if (drill.namedPrimaryOwnerRequired !== true) {
    failures.push('primary restore owner is required');
  }
  if (drill.namedBackupOwnerRequired !== true) {
    failures.push('backup restore owner is required');
  }
  if (drill.evidenceRequired !== true) {
    failures.push('restore drill evidence is required');
  }
  if (drill.actualDurationRequired !== true) {
    failures.push('actual restore duration is required');
  }
  if (drill.failureFollowupRequired !== true) {
    failures.push('failed drill follow-up is required');
  }
  if (drill.measuredRpoRequired !== true) {
    failures.push('measured restore-point age is required');
  }
  if (drill.measuredRtoRequired !== true) {
    failures.push('measured business-usable RTO is required');
  }
  if (drill.atomicShellExecutionRequired !== true) {
    failures.push('restore shell samples must fail atomically');
  }

  if (security.productionSecretsReuseAllowed !== false) {
    failures.push('Production secrets reuse must be prohibited');
  }
  if (security.credentialsInRepositoryAllowed !== false) {
    failures.push('restore credentials must not be allowed in repository');
  }
  if (security.credentialsInLogsAllowed !== false) {
    failures.push('restore credentials must not be allowed in logs');
  }
  if (security.restoredSensitiveDataPublicExposureAllowed !== false) {
    failures.push(
      'public exposure of restored sensitive data must be prohibited',
    );
  }

  return {
    status:
      failures.length === 0
        ? 'RESTORE_DRILL_POLICY_PASSED'
        : 'RESTORE_DRILL_POLICY_FAILED',
    failures,
  };
}

export async function runRestoreDrillPolicyCheck({
  policyPath = 'ops/restore-drill-policy.json',
  log = console.log,
} = {}) {
  const policyText = await readFile(policyPath, 'utf8');
  const result = validateRestoreDrillPolicy(JSON.parse(policyText));
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(
      `Restore drill policy check failed (${result.failures.length})`,
    );
  }
  return result;
}

if (isMainModule(import.meta.url)) {
  runRestoreDrillPolicyCheck().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Restore drill policy check failed',
    );
    process.exitCode = 1;
  });
}
