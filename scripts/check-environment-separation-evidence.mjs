import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const requiredFields = [
  'evidenceId',
  'verifiedAt',
  'stagingSupabaseDistinct',
  'productionSupabaseDistinct',
  'stagingVercelDistinct',
  'productionVercelDistinct',
  'stagingAndProductionSupabaseDifferent',
  'stagingAndProductionVercelDifferent',
  'secretsSeparated',
  'productionDataUsedOutsideProduction',
  'runtimeBindingCheck',
  'stagingCommitMatchesMain',
  'stagingSmokeTest',
  'secretFreeEvidence',
];

const allowedFields = new Set([
  ...requiredFields,
  'migrationParity',
  'notes',
]);

const sensitivePatterns = [
  /https?:\/\/[a-z0-9-]+\.supabase\.co/iu,
  /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/u,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
];

export function validateEnvironmentSeparationEvidence(document) {
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

  const requiredTrue = [
    'stagingSupabaseDistinct',
    'productionSupabaseDistinct',
    'stagingVercelDistinct',
    'productionVercelDistinct',
    'stagingAndProductionSupabaseDifferent',
    'stagingAndProductionVercelDifferent',
    'secretsSeparated',
    'stagingCommitMatchesMain',
    'secretFreeEvidence',
  ];
  for (const field of requiredTrue) {
    if (document[field] !== true) findings.push(`${field}-must-be-true`);
  }

  if (document.productionDataUsedOutsideProduction !== false) {
    findings.push('production-data-must-not-be-used-outside-production');
  }
  if (document.runtimeBindingCheck !== 'PASS') {
    findings.push('runtime-binding-check-must-pass');
  }
  if (document.stagingSmokeTest !== 'PASS') {
    findings.push('staging-smoke-test-must-pass');
  }
  if (
    typeof document.verifiedAt === 'string' &&
    Number.isNaN(Date.parse(document.verifiedAt))
  ) {
    findings.push('invalid-timestamp:verifiedAt');
  }

  for (const [field, value] of Object.entries(document)) {
    if (typeof value !== 'string') continue;
    for (const pattern of sensitivePatterns) {
      if (pattern.test(value)) {
        findings.push(`sensitive-environment-value:${field}`);
        break;
      }
    }
  }

  return {
    status:
      findings.length === 0
        ? 'ENVIRONMENT_SEPARATION_EVIDENCE_PASSED'
        : 'ENVIRONMENT_SEPARATION_EVIDENCE_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export async function runEnvironmentSeparationEvidenceCheck({
  path,
  log = console.log,
} = {}) {
  if (!path) throw new Error('Environment separation evidence path is required');
  const document = JSON.parse(await readFile(path, 'utf8'));
  const result = validateEnvironmentSeparationEvidence(document);
  log(JSON.stringify(result, null, 2));
  if (!result.complete) {
    throw new Error(
      `Environment separation evidence check failed (${result.findings.length})`,
    );
  }
  return result;
}

function failed(rule) {
  return {
    status: 'ENVIRONMENT_SEPARATION_EVIDENCE_FAILED',
    complete: false,
    findings: [rule],
  };
}

function isBlank(value) {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && value.trim() === '';
}

if (isMainModule(import.meta.url)) {
  runEnvironmentSeparationEvidenceCheck({ path: process.argv[2] }).catch(
    (error) => {
      console.error(
        error instanceof Error
          ? error.message
          : 'Environment separation evidence check failed',
      );
      process.exitCode = 1;
    },
  );
}
