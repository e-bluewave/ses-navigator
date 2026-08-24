import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

export function validateStorageBackupPolicy(policy) {
  const failures = [];
  const source = policy?.source ?? {};
  const schedule = policy?.schedule ?? {};
  const destination = policy?.destination ?? {};
  const transfer = policy?.transfer ?? {};
  const coordination = policy?.coordination ?? {};
  const security = policy?.security ?? {};

  if (policy?.version !== 1) failures.push('policy version must be 1');
  if (policy?.scope !== 'supabase-storage-object-backup') {
    failures.push('scope must be supabase-storage-object-backup');
  }
  if (source.protocol !== 's3-compatible') {
    failures.push('source protocol must be s3-compatible');
  }
  if (source.includeAllFileBuckets !== true) {
    failures.push('all file buckets must be included');
  }
  if (source.preserveBucketAndObjectKey !== true) {
    failures.push('bucket and object key must be preserved');
  }
  if (source.sourceVersioningAvailable !== false) {
    failures.push('source versioning must not be assumed');
  }
  if (
    !Number.isInteger(schedule.maximumIntervalHours) ||
    schedule.maximumIntervalHours < 1 ||
    schedule.maximumIntervalHours > 24
  ) {
    failures.push('backup interval must be between 1 and 24 hours');
  }
  if (
    !Number.isInteger(schedule.retentionDays) ||
    schedule.retentionDays < 35
  ) {
    failures.push('backup retention must be at least 35 days');
  }
  if (destination.offsiteRequired !== true) {
    failures.push('offsite destination is required');
  }
  if (destination.sameSupabaseProjectAllowed !== false) {
    failures.push('same Supabase project destination must be prohibited');
  }
  if (destination.repositoryAllowed !== false) {
    failures.push('repository backup storage must be prohibited');
  }
  if (destination.githubActionsArtifactLongTermAllowed !== false) {
    failures.push(
      'GitHub Actions artifacts must not be long-term backup storage',
    );
  }
  if (destination.versioningRequired !== true) {
    failures.push('destination versioning is required');
  }
  if (destination.encryptionAtRestRequired !== true) {
    failures.push('destination encryption at rest is required');
  }
  if (transfer.tlsRequired !== true) failures.push('TLS transfer is required');
  if (transfer.inventoryRequired !== true) {
    failures.push('object inventory is required');
  }
  if (transfer.checksumOrEquivalentIntegrityRequired !== true) {
    failures.push('object integrity verification is required');
  }
  if (transfer.deletePropagationAllowed !== false) {
    failures.push('source deletes must not automatically propagate');
  }
  if (coordination.databaseMetadataBackupRequired !== true) {
    failures.push('database metadata backup coordination is required');
  }
  if (coordination.databaseBackupTrackedBy !== 'BA-006') {
    failures.push('database backup must be tracked by BA-006');
  }
  if (coordination.restoreDrillTrackedBy !== 'BA-008') {
    failures.push('restore drill must be tracked by BA-008');
  }
  if (security.dedicatedBackupCredentialRequired !== true) {
    failures.push('dedicated backup credential is required');
  }
  if (security.credentialInRepositoryAllowed !== false) {
    failures.push('backup credential must not be allowed in repository');
  }
  if (security.credentialInLogsAllowed !== false) {
    failures.push('backup credential must not be allowed in logs');
  }
  if (security.objectDataInRepositoryAllowed !== false) {
    failures.push('storage object data must not be allowed in repository');
  }

  return {
    status:
      failures.length === 0
        ? 'STORAGE_BACKUP_POLICY_PASSED'
        : 'STORAGE_BACKUP_POLICY_FAILED',
    failures,
  };
}

export async function runStorageBackupPolicyCheck({
  policyPath = 'ops/storage-backup-policy.json',
  log = console.log,
} = {}) {
  const policyText = await readFile(policyPath, 'utf8');
  const result = validateStorageBackupPolicy(JSON.parse(policyText));
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(
      `Storage backup policy check failed (${result.failures.length})`,
    );
  }
  return result;
}

if (isMainModule(import.meta.url)) {
  runStorageBackupPolicyCheck().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Storage backup policy check failed',
    );
    process.exitCode = 1;
  });
}
