import { readFile } from 'node:fs/promises';

import { isMainModule } from './cli-entry.mjs';

const requiredFields = [
  'evidenceId',
  'environment',
  'completedAt',
  'dryRunInventoryCompleted',
  'databaseDeletionCompleted',
  'storageDeletionCompleted',
  'derivedDataDeletionCompleted',
  'irreversibleAnonymizationVerified',
  'reidentificationKeyPresent',
  'legalHoldRespected',
  'tenantOffboardingAccessRevoked',
  'newWritesBlocked',
  'integrationCredentialsRevoked',
  'webhooksAndTokensRevoked',
  'backupTombstoneLedgerUpdated',
  'restoreReapplyDeletionVerified',
  'productionIdentifiersRecorded',
  'personalDataRecorded',
  'secretOrPersonalDataExposed',
  'secretFreeEvidence',
];

const allowedFields = new Set([
  ...requiredFields,
  'dispositionMode',
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

export function validatePersonalDataErasureEvidence(document, policy) {
  const findings = [];

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return failed('evidence-object-required');
  }
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return failed('personal-data-erasure-policy-object-required');
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

  const requiredTrue = [
    'dryRunInventoryCompleted',
    'databaseDeletionCompleted',
    'storageDeletionCompleted',
    'derivedDataDeletionCompleted',
    'irreversibleAnonymizationVerified',
    'legalHoldRespected',
    'tenantOffboardingAccessRevoked',
    'newWritesBlocked',
    'integrationCredentialsRevoked',
    'webhooksAndTokensRevoked',
    'backupTombstoneLedgerUpdated',
    'restoreReapplyDeletionVerified',
    'secretFreeEvidence',
  ];

  for (const field of requiredTrue) {
    if (document[field] !== true) findings.push(`${field}-must-be-true`);
  }

  for (const field of [
    'reidentificationKeyPresent',
    'productionIdentifiersRecorded',
    'personalDataRecorded',
    'secretOrPersonalDataExposed',
  ]) {
    if (document[field] !== false) findings.push(`${field}-must-be-false`);
  }

  if (
    document.dispositionMode !== undefined &&
    !policy.allowedDispositionModes?.includes(document.dispositionMode)
  ) {
    findings.push('disposition-mode-not-allowed');
  }

  if (policy.anonymization?.mustBeIrreversible !== true) {
    findings.push('policy-irreversible-anonymization-required');
  }
  if (policy.anonymization?.reidentificationKeyAllowed !== false) {
    findings.push('policy-reidentification-key-must-be-forbidden');
  }
  if (policy.legalHold?.overridesDeletion !== true) {
    findings.push('policy-legal-hold-override-required');
  }
  if (policy.execution?.backupTombstoneLedgerRequired !== true) {
    findings.push('policy-backup-tombstone-ledger-required');
  }
  if (policy.execution?.restoreReapplyDeletionRequired !== true) {
    findings.push('policy-restore-reapply-deletion-required');
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
        findings.push(`sensitive-erasure-value:${field}`);
        break;
      }
    }
  }

  return {
    status:
      findings.length === 0
        ? 'PERSONAL_DATA_ERASURE_EVIDENCE_PASSED'
        : 'PERSONAL_DATA_ERASURE_EVIDENCE_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export async function runPersonalDataErasureEvidenceCheck({
  evidencePath,
  policyPath = 'ops/personal-data-erasure-policy.json',
  log = console.log,
} = {}) {
  if (!evidencePath) {
    throw new Error('Personal data erasure evidence path is required');
  }

  const [document, policy] = await Promise.all([
    readJson(evidencePath),
    readJson(policyPath),
  ]);
  const result = validatePersonalDataErasureEvidence(document, policy);
  log(JSON.stringify(result, null, 2));

  if (!result.complete) {
    throw new Error(
      `Personal data erasure evidence check failed (${result.findings.length})`,
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
    status: 'PERSONAL_DATA_ERASURE_EVIDENCE_FAILED',
    complete: false,
    findings: [rule],
  };
}

if (isMainModule(import.meta.url)) {
  runPersonalDataErasureEvidenceCheck({ evidencePath: process.argv[2] }).catch(
    (error) => {
      console.error(
        error instanceof Error
          ? error.message
          : 'Personal data erasure evidence check failed',
      );
      process.exitCode = 1;
    },
  );
}
