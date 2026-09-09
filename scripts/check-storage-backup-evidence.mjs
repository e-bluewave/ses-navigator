import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const requiredFields = [
  'evidenceId',
  'environment',
  'startedAt',
  'completedAt',
  'allFileBucketsIncluded',
  'bucketAndObjectKeyPreserved',
  'sourceObjectCount',
  'backedUpObjectCount',
  'sourceTotalBytes',
  'backedUpTotalBytes',
  'transferErrorCount',
  'allTransferErrorsRetried',
  'integrityVerification',
  'manifestCreated',
  'offsiteDestinationConfirmed',
  'sameSupabaseProjectDestination',
  'repositoryDestination',
  'githubActionsArtifactLongTermDestination',
  'generationProtectionMode',
  'generationProtectionVerified',
  'timestampedSnapshotPrefixUsed',
  'retentionLockEnabled',
  'encryptedAtRest',
  'tlsInTransit',
  'retentionDays',
  'frequencyHours',
  'sourceDeletionPropagatesImmediately',
  'dedicatedBackupCredentialUsed',
  'databaseBackupRunLinked',
  'databaseRecoveryPointRecorded',
  'storageRecoveryPointRecorded',
  'recoveryPointSkewMinutesMeasured',
  'jointRecoveryPointEstablished',
  'credentialExposed',
  'objectDataExposed',
  'secretFreeEvidence',
];

const allowedFields = new Set([...requiredFields, 'notes']);
const allowedEnvironments = new Set(['Staging', 'Production']);
const allowedIntegrity = new Set(['checksum', 'etag-and-size', 'equivalent']);
const allowedGenerationProtectionModes = new Set([
  'native-versioning',
  'immutable-snapshot',
]);
const sensitivePatterns = [
  /https?:\/\/[a-z0-9-]+\.supabase\.co/iu,
  /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/u,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
  /\bAKIA[A-Z0-9]{12,}\b/u,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
];

export function validateStorageBackupEvidence(document) {
  const findings = [];

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return failed('evidence-object-required');
  }

  for (const key of Object.keys(document)) {
    if (!allowedFields.has(key)) findings.push(`unknown-field:${key}`);
  }
  for (const field of requiredFields) {
    if (!(field in document) || isBlank(document[field])) {
      findings.push(`required-field-missing:${field}`);
    }
  }

  if (!allowedEnvironments.has(document.environment)) {
    findings.push('environment-must-be-staging-or-production');
  }

  for (const field of [
    'allFileBucketsIncluded',
    'bucketAndObjectKeyPreserved',
    'manifestCreated',
    'offsiteDestinationConfirmed',
    'generationProtectionVerified',
    'encryptedAtRest',
    'tlsInTransit',
    'dedicatedBackupCredentialUsed',
    'databaseBackupRunLinked',
    'databaseRecoveryPointRecorded',
    'storageRecoveryPointRecorded',
    'jointRecoveryPointEstablished',
    'secretFreeEvidence',
  ]) {
    if (document[field] !== true) findings.push(`${field}-must-be-true`);
  }

  for (const field of [
    'sameSupabaseProjectDestination',
    'repositoryDestination',
    'githubActionsArtifactLongTermDestination',
    'sourceDeletionPropagatesImmediately',
    'credentialExposed',
    'objectDataExposed',
  ]) {
    if (document[field] !== false) findings.push(`${field}-must-be-false`);
  }

  if (
    !allowedGenerationProtectionModes.has(document.generationProtectionMode)
  ) {
    findings.push('generation-protection-mode-invalid');
  }
  if (document.generationProtectionMode === 'immutable-snapshot') {
    if (document.timestampedSnapshotPrefixUsed !== true) {
      findings.push('immutable-snapshot-requires-timestamped-prefix');
    }
    if (document.retentionLockEnabled !== true) {
      findings.push('immutable-snapshot-requires-retention-lock');
    }
  }

  for (const field of [
    'sourceObjectCount',
    'backedUpObjectCount',
    'sourceTotalBytes',
    'backedUpTotalBytes',
    'transferErrorCount',
  ]) {
    if (!Number.isInteger(document[field]) || document[field] < 0) {
      findings.push(`${field}-must-be-non-negative-integer`);
    }
  }

  if (
    Number.isInteger(document.sourceObjectCount) &&
    Number.isInteger(document.backedUpObjectCount) &&
    document.sourceObjectCount !== document.backedUpObjectCount
  ) {
    findings.push('source-and-backed-up-object-count-must-match');
  }
  if (
    Number.isInteger(document.sourceTotalBytes) &&
    Number.isInteger(document.backedUpTotalBytes) &&
    document.sourceTotalBytes !== document.backedUpTotalBytes
  ) {
    findings.push('source-and-backed-up-total-bytes-must-match');
  }
  if (
    Number.isInteger(document.transferErrorCount) &&
    document.transferErrorCount > 0 &&
    document.allTransferErrorsRetried !== true
  ) {
    findings.push('transfer-errors-must-be-retried');
  }
  if (!allowedIntegrity.has(document.integrityVerification)) {
    findings.push('integrity-verification-method-invalid');
  }
  if (
    !Number.isInteger(document.retentionDays) ||
    document.retentionDays < 35
  ) {
    findings.push('retention-days-must-be-at-least-35');
  }
  if (
    !Number.isInteger(document.frequencyHours) ||
    document.frequencyHours < 1 ||
    document.frequencyHours > 24
  ) {
    findings.push('frequency-hours-must-be-between-1-and-24');
  }
  if (!isNonNegativeNumber(document.recoveryPointSkewMinutesMeasured)) {
    findings.push('recovery-point-skew-minutes-must-be-non-negative-number');
  }

  for (const field of ['startedAt', 'completedAt']) {
    if (
      typeof document[field] === 'string' &&
      Number.isNaN(Date.parse(document[field]))
    ) {
      findings.push(`invalid-timestamp:${field}`);
    }
  }
  if (
    typeof document.startedAt === 'string' &&
    typeof document.completedAt === 'string' &&
    !Number.isNaN(Date.parse(document.startedAt)) &&
    !Number.isNaN(Date.parse(document.completedAt)) &&
    Date.parse(document.completedAt) < Date.parse(document.startedAt)
  ) {
    findings.push('completed-at-must-not-precede-started-at');
  }

  for (const [field, value] of Object.entries(document)) {
    if (typeof value !== 'string') continue;
    for (const pattern of sensitivePatterns) {
      if (pattern.test(value)) {
        findings.push(`sensitive-storage-value:${field}`);
        break;
      }
    }
  }

  return {
    status:
      findings.length === 0
        ? 'STORAGE_BACKUP_EVIDENCE_PASSED'
        : 'STORAGE_BACKUP_EVIDENCE_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export function validateStorageBackupEvidenceText(text) {
  if (typeof text !== 'string') return failed('evidence-text-required');
  if (text.charCodeAt(0) === 0xfeff) return failed('utf8-bom-not-allowed');

  let document;
  try {
    document = JSON.parse(text);
  } catch {
    return failed('invalid-json');
  }
  return validateStorageBackupEvidence(document);
}

export async function runStorageBackupEvidenceCheck({
  path,
  log = console.log,
} = {}) {
  if (!path) throw new Error('Storage backup evidence path is required');
  const result = validateStorageBackupEvidenceText(
    await readFile(path, 'utf8'),
  );
  log(JSON.stringify(result, null, 2));
  if (!result.complete) {
    throw new Error(
      `Storage backup evidence check failed (${result.findings.length})`,
    );
  }
  return result;
}

function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function failed(rule) {
  return {
    status: 'STORAGE_BACKUP_EVIDENCE_FAILED',
    complete: false,
    findings: [rule],
  };
}

function isBlank(value) {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && value.trim() === '';
}

if (isMainModule(import.meta.url)) {
  runStorageBackupEvidenceCheck({ path: process.argv[2] }).catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Storage backup evidence check failed',
    );
    process.exitCode = 1;
  });
}
