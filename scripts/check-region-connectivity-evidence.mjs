import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const requiredFields = [
  'evidenceId',
  'verifiedAt',
  'stagingRegionConfirmed',
  'productionRegionConfirmed',
  'regionAlignment',
  'stagingDatabaseMode',
  'productionDatabaseMode',
  'migrationConnectionMode',
  'backupRestoreConnectionMode',
  'runtimeBindingCheck',
  'stagingSmokeTest',
  'latencyMeasured',
  'latencyP50Ms',
  'latencyP95Ms',
  'latencyP99Ms',
  'errorRatePercent',
  'crossRegionProductionException',
  'secretFreeEvidence',
];

const allowedFields = new Set([
  ...requiredFields,
  'sampleCount',
  'notes',
]);

const runtimeModes = new Set(['data-api', 'transaction-pooler']);
const adminModes = new Set(['direct', 'session-pooler']);
const sensitivePatterns = [
  /https?:\/\/[a-z0-9-]+\.supabase\.co/iu,
  /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/u,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
  /postgres(?:ql)?:\/\//iu,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
];

export function validateRegionConnectivityEvidence(document) {
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

  for (const field of [
    'stagingRegionConfirmed',
    'productionRegionConfirmed',
    'latencyMeasured',
    'secretFreeEvidence',
  ]) {
    if (document[field] !== true) findings.push(`${field}-must-be-true`);
  }

  if (document.regionAlignment !== 'PASS') {
    findings.push('region-alignment-must-pass');
  }
  if (!runtimeModes.has(document.stagingDatabaseMode)) {
    findings.push('invalid-staging-database-mode');
  }
  if (!runtimeModes.has(document.productionDatabaseMode)) {
    findings.push('invalid-production-database-mode');
  }
  if (document.stagingDatabaseMode !== document.productionDatabaseMode) {
    findings.push('staging-production-database-mode-must-match');
  }
  if (!adminModes.has(document.migrationConnectionMode)) {
    findings.push('migration-mode-must-be-direct-or-session-pooler');
  }
  if (!adminModes.has(document.backupRestoreConnectionMode)) {
    findings.push('backup-restore-mode-must-be-direct-or-session-pooler');
  }
  if (document.runtimeBindingCheck !== 'PASS') {
    findings.push('runtime-binding-check-must-pass');
  }
  if (document.stagingSmokeTest !== 'PASS') {
    findings.push('staging-smoke-test-must-pass');
  }
  if (!['none', 'approved'].includes(document.crossRegionProductionException)) {
    findings.push('cross-region-production-exception-invalid');
  }

  validateMetric(document, 'latencyP50Ms', findings);
  validateMetric(document, 'latencyP95Ms', findings);
  validateMetric(document, 'latencyP99Ms', findings);
  validateMetric(document, 'errorRatePercent', findings);

  if (
    isFiniteNumber(document.latencyP50Ms) &&
    isFiniteNumber(document.latencyP95Ms) &&
    document.latencyP50Ms > document.latencyP95Ms
  ) {
    findings.push('latency-p50-must-not-exceed-p95');
  }
  if (
    isFiniteNumber(document.latencyP95Ms) &&
    isFiniteNumber(document.latencyP99Ms) &&
    document.latencyP95Ms > document.latencyP99Ms
  ) {
    findings.push('latency-p95-must-not-exceed-p99');
  }
  if (
    isFiniteNumber(document.errorRatePercent) &&
    document.errorRatePercent > 100
  ) {
    findings.push('error-rate-percent-must-not-exceed-100');
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
        ? 'REGION_CONNECTIVITY_EVIDENCE_PASSED'
        : 'REGION_CONNECTIVITY_EVIDENCE_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export async function runRegionConnectivityEvidenceCheck({
  path,
  log = console.log,
} = {}) {
  if (!path) throw new Error('Region connectivity evidence path is required');
  const document = JSON.parse(await readFile(path, 'utf8'));
  const result = validateRegionConnectivityEvidence(document);
  log(JSON.stringify(result, null, 2));
  if (!result.complete) {
    throw new Error(
      `Region connectivity evidence check failed (${result.findings.length})`,
    );
  }
  return result;
}

function validateMetric(document, field, findings) {
  if (!isFiniteNumber(document[field]) || document[field] < 0) {
    findings.push(`${field}-must-be-non-negative-number`);
  }
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function failed(rule) {
  return {
    status: 'REGION_CONNECTIVITY_EVIDENCE_FAILED',
    complete: false,
    findings: [rule],
  };
}

function isBlank(value) {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && value.trim() === '';
}

if (isMainModule(import.meta.url)) {
  runRegionConnectivityEvidenceCheck({ path: process.argv[2] }).catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Region connectivity evidence check failed',
    );
    process.exitCode = 1;
  });
}
