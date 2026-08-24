import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const requiredFields = [
  'evidenceId',
  'environment',
  'startedAt',
  'completedAt',
  'productionTarget',
  'separateRestoreEnvironment',
  'productionSecretsReused',
  'databaseBackupRunLinked',
  'storageBackupRunLinked',
  'restorePointAlignment',
  'rolesRestore',
  'schemaRestore',
  'dataRestore',
  'databaseRestoreTransactional',
  'databaseOnErrorStop',
  'storageRestore',
  'storageObjectCountParity',
  'storageTotalBytesParity',
  'storageIntegrityVerification',
  'databaseStorageConsistency',
  'authSmokeTest',
  'applicationSmokeTest',
  'dataApiSecurityRegression',
  'rlsTenantIsolation',
  'storageInventoryVerification',
  'representativeFileRead',
  'migrationParity',
  'deletionTombstonesReapplied',
  'rtoMinutesMeasured',
  'recoveryPointAgeMinutesMeasured',
  'followUpRequired',
  'secretOrPersonalDataExposed',
  'secretFreeEvidence',
];

const allowedFields = new Set([
  ...requiredFields,
  'followUpReferencePresent',
  'notes',
]);

const allowedEnvironments = new Set(['Staging', 'Disposable']);
const passFields = [
  'restorePointAlignment',
  'rolesRestore',
  'schemaRestore',
  'dataRestore',
  'storageRestore',
  'storageObjectCountParity',
  'storageTotalBytesParity',
  'storageIntegrityVerification',
  'databaseStorageConsistency',
  'authSmokeTest',
  'applicationSmokeTest',
  'dataApiSecurityRegression',
  'rlsTenantIsolation',
  'storageInventoryVerification',
  'representativeFileRead',
  'migrationParity',
  'deletionTombstonesReapplied',
];
const sensitivePatterns = [
  /postgres(?:ql)?:\/\//iu,
  /https?:\/\/[a-z0-9-]+\.supabase\.co/iu,
  /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/u,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
];

export function validateRestoreDrillEvidence(document) {
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
    findings.push('environment-must-be-staging-or-disposable');
  }

  for (const field of [
    'separateRestoreEnvironment',
    'databaseBackupRunLinked',
    'storageBackupRunLinked',
    'databaseRestoreTransactional',
    'databaseOnErrorStop',
    'secretFreeEvidence',
  ]) {
    if (document[field] !== true) findings.push(`${field}-must-be-true`);
  }

  for (const field of [
    'productionTarget',
    'productionSecretsReused',
    'secretOrPersonalDataExposed',
  ]) {
    if (document[field] !== false) findings.push(`${field}-must-be-false`);
  }

  for (const field of passFields) {
    if (document[field] !== 'PASS') findings.push(`${field}-must-pass`);
  }

  for (const field of [
    'rtoMinutesMeasured',
    'recoveryPointAgeMinutesMeasured',
  ]) {
    if (!isNonNegativeNumber(document[field])) {
      findings.push(`${field}-must-be-non-negative-number`);
    }
  }

  if (
    document.followUpRequired === true &&
    document.followUpReferencePresent !== true
  ) {
    findings.push('follow-up-reference-required');
  }
  if (
    document.followUpRequired !== true &&
    document.followUpRequired !== false
  ) {
    findings.push('followUpRequired-must-be-boolean');
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
        findings.push(`sensitive-restore-value:${field}`);
        break;
      }
    }
  }

  return {
    status:
      findings.length === 0
        ? 'RESTORE_DRILL_EVIDENCE_PASSED'
        : 'RESTORE_DRILL_EVIDENCE_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export async function runRestoreDrillEvidenceCheck({
  path,
  log = console.log,
} = {}) {
  if (!path) throw new Error('Restore drill evidence path is required');
  const document = JSON.parse(await readFile(path, 'utf8'));
  const result = validateRestoreDrillEvidence(document);
  log(JSON.stringify(result, null, 2));
  if (!result.complete) {
    throw new Error(
      `Restore drill evidence check failed (${result.findings.length})`,
    );
  }
  return result;
}

function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function failed(rule) {
  return {
    status: 'RESTORE_DRILL_EVIDENCE_FAILED',
    complete: false,
    findings: [rule],
  };
}

function isBlank(value) {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && value.trim() === '';
}

if (isMainModule(import.meta.url)) {
  runRestoreDrillEvidenceCheck({ path: process.argv[2] }).catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Restore drill evidence check failed',
    );
    process.exitCode = 1;
  });
}
