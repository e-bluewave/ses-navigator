import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const REQUIRED_EXCLUDES = new Set([
  'storage.buckets_vectors',
  'storage.vector_indexes',
]);

export function validateDatabaseBackupPolicy(policy) {
  const failures = [];
  const connection = policy?.connection ?? {};
  const artifacts = policy?.artifacts ?? {};
  const destination = policy?.destination ?? {};
  const encryption = policy?.encryption ?? {};
  const security = policy?.security ?? {};
  const verification = policy?.verification ?? {};

  if (policy?.version !== 1) failures.push('policy version must be 1');
  if (policy?.scope !== 'database-logical-backup')
    failures.push('scope must be database-logical-backup');
  if (policy?.method !== 'supabase-cli-db-dump')
    failures.push('method must be supabase-cli-db-dump');
  if (
    !Number.isInteger(policy?.frequencyHours) ||
    policy.frequencyHours < 1 ||
    policy.frequencyHours > 24
  ) {
    failures.push('backup frequency must be between 1 and 24 hours');
  }
  if (!Number.isInteger(policy?.retentionDays) || policy.retentionDays < 35) {
    failures.push('backup retention must be at least 35 days');
  }
  if (connection.mode !== 'direct-or-session-pooler') {
    failures.push('backup connection must use direct or session pooler');
  }
  if (connection.transactionPoolerAllowed !== false) {
    failures.push('transaction pooler must not be allowed for logical backup');
  }
  if (
    artifacts.roles !== true ||
    artifacts.schema !== true ||
    artifacts.data !== true
  ) {
    failures.push('roles, schema and data backup artifacts are required');
  }
  if (artifacts.dataUseCopy !== true)
    failures.push('data backup must use COPY mode');

  const excluded = new Set(
    Array.isArray(artifacts.excludedDataObjects)
      ? artifacts.excludedDataObjects
      : [],
  );
  for (const objectName of REQUIRED_EXCLUDES) {
    if (!excluded.has(objectName))
      failures.push(`required data exclusion missing: ${objectName}`);
  }

  if (destination.offsiteRequired !== true)
    failures.push('offsite backup destination is required');
  if (destination.repositoryAllowed !== false)
    failures.push('repository backup storage must be prohibited');
  if (destination.sameSupabaseProjectAllowed !== false) {
    failures.push('same Supabase project backup storage must be prohibited');
  }
  if (destination.longTermGitHubActionsArtifactAllowed !== false) {
    failures.push(
      'GitHub Actions artifacts must not be long-term backup storage',
    );
  }
  if (encryption.inTransit !== 'tls')
    failures.push('backup transfer must require TLS');
  if (encryption.atRestRequired !== true)
    failures.push('backup destination must require encryption at rest');
  if (security.databaseUrlInLogsAllowed !== false)
    failures.push('database URL must not be allowed in logs');
  if (security.databasePasswordInRepositoryAllowed !== false) {
    failures.push('database password must not be allowed in repository');
  }
  if (security.backupContainsSecretsReviewRequired !== true) {
    failures.push('backup secret-content review must be required');
  }
  if (verification.manifestRequired !== true)
    failures.push('backup manifest is required');
  if (verification.checksumRequired !== true)
    failures.push('backup checksum is required');
  if (verification.restoreDrillTrackedBy !== 'BA-008')
    failures.push('restore drill must be tracked by BA-008');

  return {
    status:
      failures.length === 0
        ? 'DATABASE_BACKUP_POLICY_PASSED'
        : 'DATABASE_BACKUP_POLICY_FAILED',
    failures,
  };
}

export async function runDatabaseBackupPolicyCheck({
  policyPath = 'ops/database-backup-policy.json',
  log = console.log,
} = {}) {
  const policyText = await readFile(policyPath, 'utf8');
  const result = validateDatabaseBackupPolicy(JSON.parse(policyText));
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(
      `Database backup policy check failed (${result.failures.length})`,
    );
  }
  return result;
}

if (isMainModule(import.meta.url)) {
  runDatabaseBackupPolicyCheck().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Database backup policy check failed',
    );
    process.exitCode = 1;
  });
}
