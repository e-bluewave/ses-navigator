import { readFile } from 'node:fs/promises';

import { isMainModule } from './cli-entry.mjs';

const requiredFields = [
  'evidenceId',
  'environment',
  'completedAt',
  'allRequiredSignalsObserved',
  'criticalAlertDelivered',
  'warningAlertDelivered',
  'deduplicationVerified',
  'recoveryNotificationVerified',
  'ownerRoutingVerified',
  'testAlertCompleted',
  'measuredBaselineCaptured',
  'thresholdReviewCompleted',
  'runbookLinked',
  'quarterlyReviewScheduled',
  'secretsInAlerts',
  'personalDataInAlerts',
  'queryParameterValuesInAlerts',
  'productionIdentifiersRecorded',
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

export function validateMonitoringEvidence(document, policy) {
  const findings = [];

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return failed('evidence-object-required');
  }
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return failed('monitoring-policy-object-required');
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
    'allRequiredSignalsObserved',
    'criticalAlertDelivered',
    'warningAlertDelivered',
    'deduplicationVerified',
    'recoveryNotificationVerified',
    'ownerRoutingVerified',
    'testAlertCompleted',
    'measuredBaselineCaptured',
    'thresholdReviewCompleted',
    'runbookLinked',
    'quarterlyReviewScheduled',
    'secretFreeEvidence',
  ]) {
    if (document[field] !== true) findings.push(`${field}-must-be-true`);
  }

  for (const field of [
    'secretsInAlerts',
    'personalDataInAlerts',
    'queryParameterValuesInAlerts',
    'productionIdentifiersRecorded',
  ]) {
    if (document[field] !== false) findings.push(`${field}-must-be-false`);
  }

  const requiredSignals = [
    'applicationErrors',
    'slowSql',
    'databaseConnections',
    'databaseCapacity',
    'databaseLocks',
    'rlsLoad',
    'jobBacklog',
  ];
  for (const signal of requiredSignals) {
    if (policy.signals?.[signal] !== true) {
      findings.push(`policy-signal-required:${signal}`);
    }
  }

  if (policy.alerting?.criticalRequiresImmediateNotification !== true) {
    findings.push('policy-critical-notification-required');
  }
  if (policy.alerting?.warningRequiresNotification !== true) {
    findings.push('policy-warning-notification-required');
  }
  if (policy.alerting?.deduplicationRequired !== true) {
    findings.push('policy-deduplication-required');
  }
  if (policy.alerting?.recoveryNotificationRequired !== true) {
    findings.push('policy-recovery-notification-required');
  }
  if (policy.operations?.testAlertRequiredBeforeProduction !== true) {
    findings.push('policy-test-alert-required');
  }
  if (policy.operations?.thresholdsMustBeTunedFromMeasuredBaseline !== true) {
    findings.push('policy-measured-baseline-required');
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
        findings.push(`sensitive-monitoring-value:${field}`);
        break;
      }
    }
  }

  return {
    status:
      findings.length === 0
        ? 'MONITORING_EVIDENCE_PASSED'
        : 'MONITORING_EVIDENCE_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export async function runMonitoringEvidenceCheck({
  evidencePath,
  policyPath = 'ops/monitoring-policy.json',
  log = console.log,
} = {}) {
  if (!evidencePath) throw new Error('Monitoring evidence path is required');
  const [document, policy] = await Promise.all([
    readJson(evidencePath),
    readJson(policyPath),
  ]);
  const result = validateMonitoringEvidence(document, policy);
  log(JSON.stringify(result, null, 2));
  if (!result.complete) {
    throw new Error(`Monitoring evidence check failed (${result.findings.length})`);
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
    status: 'MONITORING_EVIDENCE_FAILED',
    complete: false,
    findings: [rule],
  };
}

if (isMainModule(import.meta.url)) {
  runMonitoringEvidenceCheck({ evidencePath: process.argv[2] }).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Monitoring evidence check failed');
    process.exitCode = 1;
  });
}
