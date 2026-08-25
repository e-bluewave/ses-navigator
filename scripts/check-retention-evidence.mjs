import { readFile } from 'node:fs/promises';

import { isMainModule } from './cli-entry.mjs';

const requiredFields = [
  'evidenceId',
  'environment',
  'completedAt',
  'policyCategoriesValidated',
  'expiredDataDeletedOrIrreversiblyAnonymized',
  'legalHoldPreventsDeletion',
  'legalHoldReleaseResumesDisposition',
  'retentionTriggersValidated',
  'backupRestoreReappliesDeletion',
  'deletedDataReintroducedAfterRestore',
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

export function validateRetentionEvidence(document, policy) {
  const findings = [];

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return failed('evidence-object-required');
  }
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return failed('retention-policy-object-required');
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
    'policyCategoriesValidated',
    'expiredDataDeletedOrIrreversiblyAnonymized',
    'legalHoldPreventsDeletion',
    'legalHoldReleaseResumesDisposition',
    'retentionTriggersValidated',
    'backupRestoreReappliesDeletion',
    'secretFreeEvidence',
  ]) {
    if (document[field] !== true) findings.push(`${field}-must-be-true`);
  }

  for (const field of [
    'deletedDataReintroducedAfterRestore',
    'productionIdentifiersRecorded',
    'personalDataRecorded',
    'secretOrPersonalDataExposed',
  ]) {
    if (document[field] !== false) findings.push(`${field}-must-be-false`);
  }

  if (!Array.isArray(policy.categories) || policy.categories.length === 0) {
    findings.push('policy-categories-required');
  }
  if (policy.globalRules?.legalHoldOverridesDeletion !== true) {
    findings.push('policy-legal-hold-override-required');
  }
  if (policy.globalRules?.backupExpiryMustNotReintroduceDeletedData !== true) {
    findings.push('policy-backup-reintroduction-guard-required');
  }
  if (policy.globalRules?.deletionEvidenceRequired !== true) {
    findings.push('policy-deletion-evidence-required');
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
        findings.push(`sensitive-retention-value:${field}`);
        break;
      }
    }
  }

  return {
    status:
      findings.length === 0
        ? 'RETENTION_EVIDENCE_PASSED'
        : 'RETENTION_EVIDENCE_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export async function runRetentionEvidenceCheck({
  evidencePath,
  policyPath = 'ops/retention-policy.json',
  log = console.log,
} = {}) {
  if (!evidencePath) throw new Error('Retention evidence path is required');
  const [document, policy] = await Promise.all([
    readJson(evidencePath),
    readJson(policyPath),
  ]);
  const result = validateRetentionEvidence(document, policy);
  log(JSON.stringify(result, null, 2));
  if (!result.complete) {
    throw new Error(
      `Retention evidence check failed (${result.findings.length})`,
    );
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
    status: 'RETENTION_EVIDENCE_FAILED',
    complete: false,
    findings: [rule],
  };
}

if (isMainModule(import.meta.url)) {
  runRetentionEvidenceCheck({ evidencePath: process.argv[2] }).catch(
    (error) => {
      console.error(
        error instanceof Error
          ? error.message
          : 'Retention evidence check failed',
      );
      process.exitCode = 1;
    },
  );
}
