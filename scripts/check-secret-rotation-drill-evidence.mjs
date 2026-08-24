import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const requiredFields = [
  'drillId',
  'secretId',
  'environment',
  'provider',
  'startedAt',
  'completedAt',
  'inventoryValidation',
  'newCredentialDeployed',
  'smokeTest',
  'oldCredentialRevoked',
  'oldCredentialRejected',
  'newCredentialVerified',
  'productionTouched',
  'secretFreeEvidence',
  'rollbackUsed',
];

const optionalFields = [
  'oldCredentialRejectionReason',
  'monitoringResult',
  'notes',
];

const allowedFields = new Set([...requiredFields, ...optionalFields]);
const nonProductionEnvironments = new Set(['Local', 'CI', 'Preview', 'Staging']);
const secretLikePatterns = [
  /\bsb_secret_[A-Za-z0-9_-]+\b/u,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
  /\bsk-[A-Za-z0-9_-]{16,}\b/u,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
];

export function validateSecretRotationDrillEvidence(document) {
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

  if (!nonProductionEnvironments.has(document.environment)) {
    findings.push('environment-must-be-non-production');
  }
  if (document.productionTouched !== false) {
    findings.push('production-must-not-be-touched');
  }
  if (document.inventoryValidation !== 'PASS') {
    findings.push('inventory-validation-must-pass');
  }
  if (document.newCredentialDeployed !== true) {
    findings.push('new-credential-must-be-deployed');
  }
  if (document.smokeTest !== 'PASS') {
    findings.push('smoke-test-must-pass');
  }
  if (document.oldCredentialRevoked !== true) {
    findings.push('old-credential-must-be-revoked');
  }
  if (!['yes', 'not-testable'].includes(document.oldCredentialRejected)) {
    findings.push('old-credential-rejection-must-be-confirmed-or-not-testable');
  }
  if (
    document.oldCredentialRejected === 'not-testable' &&
    isBlank(document.oldCredentialRejectionReason)
  ) {
    findings.push('old-credential-not-testable-reason-required');
  }
  if (document.newCredentialVerified !== true) {
    findings.push('new-credential-must-be-verified');
  }
  if (document.secretFreeEvidence !== true) {
    findings.push('secret-free-evidence-must-be-confirmed');
  }

  for (const field of ['startedAt', 'completedAt']) {
    if (typeof document[field] === 'string' && Number.isNaN(Date.parse(document[field]))) {
      findings.push(`invalid-timestamp:${field}`);
    }
  }

  scanForSecretLikeValues(document, findings);

  return {
    status:
      findings.length === 0
        ? 'SECRET_ROTATION_DRILL_EVIDENCE_PASSED'
        : 'SECRET_ROTATION_DRILL_EVIDENCE_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export async function runSecretRotationDrillEvidenceCheck({
  path,
  log = console.log,
} = {}) {
  if (!path) throw new Error('Secret rotation drill evidence path is required');
  const source = await readFile(path, 'utf8');
  const document = JSON.parse(source);
  const result = validateSecretRotationDrillEvidence(document);
  log(JSON.stringify(result, null, 2));
  if (!result.complete) {
    throw new Error(
      `Secret rotation drill evidence check failed (${result.findings.length})`,
    );
  }
  return result;
}

function scanForSecretLikeValues(document, findings) {
  for (const [field, value] of Object.entries(document)) {
    if (typeof value !== 'string') continue;
    for (const pattern of secretLikePatterns) {
      if (pattern.test(value)) {
        findings.push(`secret-like-value:${field}`);
        break;
      }
    }
  }
}

function failed(rule) {
  return {
    status: 'SECRET_ROTATION_DRILL_EVIDENCE_FAILED',
    complete: false,
    findings: [rule],
  };
}

function isBlank(value) {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  return value.trim() === '';
}

if (isMainModule(import.meta.url)) {
  runSecretRotationDrillEvidenceCheck({ path: process.argv[2] }).catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Secret rotation drill evidence check failed',
    );
    process.exitCode = 1;
  });
}
