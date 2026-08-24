import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const requiredFields = [
  'evidenceId',
  'environment',
  'completedAt',
  'postgresMajorVersion',
  'rolesDumpCreated',
  'schemaDumpCreated',
  'dataDumpCreated',
  'dataUsedCopy',
  'rolesSizeBytes',
  'schemaSizeBytes',
  'dataSizeBytes',
  'rolesChecksumVerified',
  'schemaChecksumVerified',
  'dataChecksumVerified',
  'connectionMode',
  'offsiteDestinationConfirmed',
  'sameSupabaseProjectDestination',
  'repositoryDestination',
  'githubActionsArtifactLongTermDestination',
  'tlsInTransit',
  'encryptedAtRest',
  'retentionDays',
  'frequencyHours',
  'manifestCreated',
  'secretExposureReview',
  'databaseUrlExposed',
  'databasePasswordExposed',
  'secretFreeEvidence',
];

const allowedFields = new Set([...requiredFields, 'notes']);
const allowedEnvironments = new Set(['Staging', 'Production']);
const allowedConnectionModes = new Set(['direct', 'session-pooler']);
const sensitivePatterns = [
  /postgres(?:ql)?:\/\//iu,
  /https?:\/\/[a-z0-9-]+\.supabase\.co/iu,
  /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/u,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
];

export function validateDatabaseBackupEvidence(document) {
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
  if (!Number.isInteger(document.postgresMajorVersion) || document.postgresMajorVersion < 1) {
    findings.push('postgres-major-version-must-be-positive-integer');
  }

  for (const field of [
    'rolesDumpCreated',
    'schemaDumpCreated',
    'dataDumpCreated',
    'dataUsedCopy',
    'rolesChecksumVerified',
    'schemaChecksumVerified',
    'dataChecksumVerified',
    'offsiteDestinationConfirmed',
    'tlsInTransit',
    'encryptedAtRest',
    'manifestCreated',
    'secretFreeEvidence',
  ]) {
    if (document[field] !== true) findings.push(`${field}-must-be-true`);
  }

  for (const field of [
    'sameSupabaseProjectDestination',
    'repositoryDestination',
    'githubActionsArtifactLongTermDestination',
    'databaseUrlExposed',
    'databasePasswordExposed',
  ]) {
    if (document[field] !== false) findings.push(`${field}-must-be-false`);
  }

  if (!allowedConnectionModes.has(document.connectionMode)) {
    findings.push('connection-mode-must-be-direct-or-session-pooler');
  }
  if (document.secretExposureReview !== 'PASS') {
    findings.push('secret-exposure-review-must-pass');
  }
  if (!Number.isInteger(document.retentionDays) || document.retentionDays < 35) {
    findings.push('retention-days-must-be-at-least-35');
  }
  if (
    !Number.isInteger(document.frequencyHours) ||
    document.frequencyHours < 1 ||
    document.frequencyHours > 24
  ) {
    findings.push('frequency-hours-must-be-between-1-and-24');
  }

  for (const field of ['rolesSizeBytes', 'schemaSizeBytes', 'dataSizeBytes']) {
    if (!Number.isInteger(document[field]) || document[field] <= 0) {
      findings.push(`${field}-must-be-positive-integer`);
    }
  }

  if (
    typeof document.completedAt === 'string' &&
    Number.isNaN(Date.parse(document.completedAt))
  ) {
    findings.push('invalid-timestamp:completedAt');
  }

  for (const [field, value] of Object.entries(document)) {
    if (typeof value !== 'string') continue;
    for (const pattern of sensitivePatterns) {
      if (pattern.test(value)) {
        findings.push(`sensitive-backup-value:${field}`);
        break;
      }
    }
  }

  return {
    status:
      findings.length === 0
        ? 'DATABASE_BACKUP_EVIDENCE_PASSED'
        : 'DATABASE_BACKUP_EVIDENCE_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export async function runDatabaseBackupEvidenceCheck({
  path,
  log = console.log,
} = {}) {
  if (!path) throw new Error('Database backup evidence path is required');
  const document = JSON.parse(await readFile(path, 'utf8'));
  const result = validateDatabaseBackupEvidence(document);
  log(JSON.stringify(result, null, 2));
  if (!result.complete) {
    throw new Error(
      `Database backup evidence check failed (${result.findings.length})`,
    );
  }
  return result;
}

function failed(rule) {
  return {
    status: 'DATABASE_BACKUP_EVIDENCE_FAILED',
    complete: false,
    findings: [rule],
  };
}

function isBlank(value) {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && value.trim() === '';
}

if (isMainModule(import.meta.url)) {
  runDatabaseBackupEvidenceCheck({ path: process.argv[2] }).catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Database backup evidence check failed',
    );
    process.exitCode = 1;
  });
}
