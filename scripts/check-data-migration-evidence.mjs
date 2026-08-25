import { readFile } from 'node:fs/promises';

import { isMainModule } from './cli-entry.mjs';

const requiredFields = [
  'evidenceId',
  'environment',
  'completedAt',
  'sourceMappingReviewed',
  'deduplicationRulesReviewed',
  'stableSourceIdsUsedWhereAvailable',
  'nameOnlyAutomaticMergeUsed',
  'ambiguousMatchesManuallyReviewed',
  'dryRunCompleted',
  'executionCompleted',
  'runIdRecorded',
  'idempotentRerunVerified',
  'rerunUnexpectedCreateCount',
  'partialFailuresVisible',
  'inputChecksumVerified',
  'countsVerified',
  'referentialIntegrityPassed',
  'tenantBoundaryViolationCount',
  'runScopedRollbackVerified',
  'rollbackDryRunCompleted',
  'fullTableDeleteUsed',
  'irreversibleSideEffectsUsed',
  'updatedRowRecoveryVerified',
  'productionManualBulkEditUsed',
  'productionIdentifiersRecorded',
  'personalDataRecorded',
  'secretOrPersonalDataExposed',
  'secretFreeEvidence',
];

const allowedFields = new Set([
  ...requiredFields,
  'followUpRequired',
  'followUpReferencePresent',
  'notes',
]);
const allowedEnvironments = new Set(['Staging', 'Disposable']);
const sensitivePatterns = [
  /postgres(?:ql)?:\/\//iu,
  /https?:\/\/[a-z0-9-]+\.supabase\.co/iu,
  /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/u,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
];

export function validateDataMigrationEvidence(document, policy) {
  const findings = [];

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return failed('evidence-object-required');
  }
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return failed('data-migration-policy-object-required');
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
    'sourceMappingReviewed',
    'deduplicationRulesReviewed',
    'stableSourceIdsUsedWhereAvailable',
    'ambiguousMatchesManuallyReviewed',
    'dryRunCompleted',
    'executionCompleted',
    'runIdRecorded',
    'idempotentRerunVerified',
    'partialFailuresVisible',
    'inputChecksumVerified',
    'countsVerified',
    'referentialIntegrityPassed',
    'runScopedRollbackVerified',
    'rollbackDryRunCompleted',
    'updatedRowRecoveryVerified',
    'secretFreeEvidence',
  ]) {
    if (document[field] !== true) findings.push(`${field}-must-be-true`);
  }

  for (const field of [
    'nameOnlyAutomaticMergeUsed',
    'fullTableDeleteUsed',
    'irreversibleSideEffectsUsed',
    'productionManualBulkEditUsed',
    'productionIdentifiersRecorded',
    'personalDataRecorded',
    'secretOrPersonalDataExposed',
  ]) {
    if (document[field] !== false) findings.push(`${field}-must-be-false`);
  }

  if (document.rerunUnexpectedCreateCount !== policy.validation?.rerunUnexpectedCreateTolerance) {
    findings.push('rerun-unexpected-create-tolerance-exceeded');
  }
  if (document.tenantBoundaryViolationCount !== policy.validation?.tenantBoundaryViolationTolerance) {
    findings.push('tenant-boundary-violation-tolerance-exceeded');
  }

  if (policy.execution?.dryRunRequired !== true) findings.push('policy-dry-run-required');
  if (policy.execution?.runIdRequired !== true) findings.push('policy-run-id-required');
  if (policy.execution?.stagingValidationRequired !== true) {
    findings.push('policy-staging-validation-required');
  }
  if (policy.execution?.productionManualBulkEditAllowed !== false) {
    findings.push('policy-production-manual-bulk-edit-must-be-forbidden');
  }
  if (policy.deduplication?.nameOnlyAutomaticMergeAllowed !== false) {
    findings.push('policy-name-only-auto-merge-must-be-forbidden');
  }
  if (policy.rollback?.fullTableDeleteAllowed !== false) {
    findings.push('policy-full-table-delete-must-be-forbidden');
  }
  if (policy.rollback?.irreversibleSideEffectsAllowedInsideMigration !== false) {
    findings.push('policy-irreversible-side-effects-must-be-forbidden');
  }

  if (
    typeof document.completedAt === 'string' &&
    Number.isNaN(Date.parse(document.completedAt))
  ) {
    findings.push('invalid-timestamp:completedAt');
  }

  if (
    document.followUpRequired === true &&
    document.followUpReferencePresent !== true
  ) {
    findings.push('follow-up-reference-required');
  }

  for (const [field, value] of Object.entries(document)) {
    if (typeof value !== 'string') continue;
    for (const pattern of sensitivePatterns) {
      if (pattern.test(value)) {
        findings.push(`sensitive-data-migration-value:${field}`);
        break;
      }
    }
  }

  return {
    status:
      findings.length === 0
        ? 'DATA_MIGRATION_EVIDENCE_PASSED'
        : 'DATA_MIGRATION_EVIDENCE_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export async function runDataMigrationEvidenceCheck({
  evidencePath,
  policyPath = 'ops/data-migration-policy.json',
  log = console.log,
} = {}) {
  if (!evidencePath) throw new Error('Data migration evidence path is required');
  const [document, policy] = await Promise.all([
    readJson(evidencePath),
    readJson(policyPath),
  ]);
  const result = validateDataMigrationEvidence(document, policy);
  log(JSON.stringify(result, null, 2));
  if (!result.complete) {
    throw new Error(`Data migration evidence check failed (${result.findings.length})`);
  }
  return result;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function isBlank(value) {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && value.trim() === '';
}

function failed(rule) {
  return {
    status: 'DATA_MIGRATION_EVIDENCE_FAILED',
    complete: false,
    findings: [rule],
  };
}

if (isMainModule(import.meta.url)) {
  runDataMigrationEvidenceCheck({ evidencePath: process.argv[2] }).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Data migration evidence check failed');
    process.exitCode = 1;
  });
}
