import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const requiredFields = [
  'evidenceId',
  'environment',
  'completedAt',
  'restoreDrillEvidencePassed',
  'measurementsTakenFromBa008',
  'tier1RpoMinutesMeasured',
  'tier1RtoMinutesMeasured',
  'tier2RpoMinutesMeasured',
  'tier2RtoMinutesMeasured',
  'tier3RpoMinutesMeasured',
  'tier3RtoMinutesMeasured',
  'businessOwnerApproved',
  'technicalOwnerApproved',
  'targetsAcknowledged',
  'annualReviewScheduled',
  'exceptionUsed',
  'secretOrPersonalDataExposed',
  'secretFreeEvidence',
];

const allowedFields = new Set([
  ...requiredFields,
  'exceptionApprovalPresent',
  'exceptionExpiryPresent',
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

export function validateRpoRtoEvidence(document, policy) {
  const findings = [];

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return failed('evidence-object-required');
  }
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return failed('rpo-rto-policy-object-required');
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
    'restoreDrillEvidencePassed',
    'measurementsTakenFromBa008',
    'businessOwnerApproved',
    'technicalOwnerApproved',
    'targetsAcknowledged',
    'annualReviewScheduled',
    'secretFreeEvidence',
  ]) {
    if (document[field] !== true) findings.push(`${field}-must-be-true`);
  }

  if (document.secretOrPersonalDataExposed !== false) {
    findings.push('secretOrPersonalDataExposed-must-be-false');
  }

  if (document.exceptionUsed !== true && document.exceptionUsed !== false) {
    findings.push('exceptionUsed-must-be-boolean');
  }
  if (document.exceptionUsed === true) {
    if (document.exceptionApprovalPresent !== true) {
      findings.push('exception-approval-required');
    }
    if (document.exceptionExpiryPresent !== true) {
      findings.push('exception-expiry-required');
    }
  }

  for (const tier of ['tier1', 'tier2', 'tier3']) {
    const target = policy.tiers?.[tier];
    if (!target || !isPositiveNumber(target.rpoMinutes) || !isPositiveNumber(target.rtoMinutes)) {
      findings.push(`invalid-policy-target:${tier}`);
      continue;
    }

    const prefix = `${tier}`;
    const rpoField = `${prefix}RpoMinutesMeasured`;
    const rtoField = `${prefix}RtoMinutesMeasured`;
    const measuredRpo = document[rpoField];
    const measuredRto = document[rtoField];

    if (!isNonNegativeNumber(measuredRpo)) {
      findings.push(`${rpoField}-must-be-non-negative-number`);
    } else if (measuredRpo > target.rpoMinutes) {
      findings.push(`${tier}-rpo-target-exceeded`);
    }

    if (!isNonNegativeNumber(measuredRto)) {
      findings.push(`${rtoField}-must-be-non-negative-number`);
    } else if (measuredRto > target.rtoMinutes) {
      findings.push(`${tier}-rto-target-exceeded`);
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
        findings.push(`sensitive-rpo-rto-value:${field}`);
        break;
      }
    }
  }

  return {
    status:
      findings.length === 0
        ? 'RPO_RTO_EVIDENCE_PASSED'
        : 'RPO_RTO_EVIDENCE_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export async function runRpoRtoEvidenceCheck({
  evidencePath,
  policyPath = 'ops/rpo-rto-policy.json',
  log = console.log,
} = {}) {
  if (!evidencePath) throw new Error('RPO/RTO evidence path is required');
  const [document, policy] = await Promise.all([
    readJson(evidencePath),
    readJson(policyPath),
  ]);
  const result = validateRpoRtoEvidence(document, policy);
  log(JSON.stringify(result, null, 2));
  if (!result.complete) {
    throw new Error(`RPO/RTO evidence check failed (${result.findings.length})`);
  }
  return result;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function failed(rule) {
  return {
    status: 'RPO_RTO_EVIDENCE_FAILED',
    complete: false,
    findings: [rule],
  };
}

function isBlank(value) {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && value.trim() === '';
}

if (isMainModule(import.meta.url)) {
  runRpoRtoEvidenceCheck({ evidencePath: process.argv[2] }).catch((error) => {
    console.error(error instanceof Error ? error.message : 'RPO/RTO evidence check failed');
    process.exitCode = 1;
  });
}
