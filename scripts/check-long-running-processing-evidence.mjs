import { readFile } from 'node:fs/promises';

import { isMainModule } from './cli-entry.mjs';

const requiredTrueFields = [
  'edgeThirtySecondBoundaryValidated',
  'longTaskRoutedToWorker',
  'cpuHeavyTaskRoutedToWorker',
  'bulkTaskRoutedToWorker',
  'largeFileTaskRoutedToWorker',
  'multiAiBatchRoutedToWorker',
  'progressAndCancellationValidated',
  'jobIdValidated',
  'tenantIdValidated',
  'jobTypeValidated',
  'idempotencyKeyValidated',
  'attemptTrackingValidated',
  'leaseValidated',
  'progressStateValidated',
  'deadLetterStateValidated',
  'retryClassificationValidated',
  'backoffValidated',
  'duplicateExecutionProtectionValidated',
  'sideEffectIdempotencyValidated',
  'timeoutLeavesNoPartialBusinessState',
  'workerInterruptionRecoveryValidated',
  'restartRecoveryValidated',
  'expiredLeaseRecoveryValidated',
  'deadLetterFlowValidated',
  'monitoringSignalsValidated',
  'tenantBoundaryValidated',
  'secretFreeEvidence',
];

const requiredFalseFields = [
  'productionSecretsInPayload',
  'unnecessaryPersonalDataInPayload',
  'productionIdentifiersRecorded',
  'personalDataRecorded',
  'personalDataInCiLogs',
];

const requiredFields = [
  'evidenceId',
  'environment',
  'completedAt',
  ...requiredTrueFields,
  ...requiredFalseFields,
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

export function validateLongRunningProcessingEvidence(document, policy) {
  const findings = [];

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return failed('evidence-object-required');
  }
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return failed('long-running-processing-policy-object-required');
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

  for (const field of requiredTrueFields) {
    if (document[field] !== true) findings.push(`${field}-must-be-true`);
  }
  for (const field of requiredFalseFields) {
    if (document[field] !== false) findings.push(`${field}-must-be-false`);
  }

  if (policy.edge?.expectedMaxSeconds !== 30) findings.push('policy-edge-budget-must-be-30-seconds');
  if (policy.edge?.cpuIntensiveAllowed !== false) findings.push('policy-edge-cpu-intensive-must-be-forbidden');
  if (policy.edge?.largeFileTransformationAllowed !== false) findings.push('policy-edge-large-file-transform-must-be-forbidden');
  if (policy.edge?.safeRetryRequired !== true) findings.push('policy-edge-safe-retry-required');
  if (policy.edge?.partialBusinessStateAllowedOnTimeout !== false) findings.push('policy-timeout-partial-state-must-be-forbidden');

  for (const key of [
    'cpuIntensiveRequired',
    'bulkProcessingRequired',
    'largeFileProcessingRequired',
    'multiAiCallBatchRequired',
    'progressOrCancellationRequired',
    'retryOrDeadLetterRequired',
  ]) {
    if (policy.worker?.[key] !== true) findings.push(`policy-worker-${key}-must-be-true`);
  }
  if (policy.worker?.requiredWhenExpectedSecondsExceed !== 30) findings.push('policy-worker-threshold-must-be-30-seconds');

  for (const key of [
    'jobIdRequired',
    'tenantIdRequired',
    'jobTypeRequired',
    'idempotencyKeyRequired',
    'attemptTrackingRequired',
    'leaseRequired',
    'progressRequired',
    'deadLetterStateRequired',
  ]) {
    if (policy.job?.[key] !== true) findings.push(`policy-job-${key}-must-be-true`);
  }

  for (const key of [
    'retryableVsPermanentClassificationRequired',
    'backoffRequired',
    'duplicateExecutionProtectionRequired',
    'sideEffectIdempotencyRequired',
  ]) {
    if (policy.retry?.[key] !== true) findings.push(`policy-retry-${key}-must-be-true`);
  }

  for (const key of [
    'queueDepthRequired',
    'oldestQueuedAgeRequired',
    'runningDurationRequired',
    'retryFailureDeadLetterRequired',
    'expiredLeaseRequired',
  ]) {
    if (policy.monitoring?.[key] !== true) findings.push(`policy-monitoring-${key}-must-be-true`);
  }
  if (policy.monitoring?.trackedBy !== 'BA-013') findings.push('policy-monitoring-must-be-tracked-by-ba-013');

  if (policy.security?.productionSecretsInPayloadAllowed !== false) findings.push('policy-production-secrets-in-payload-must-be-forbidden');
  if (policy.security?.unnecessaryPersonalDataInPayloadAllowed !== false) findings.push('policy-unnecessary-personal-data-must-be-forbidden');
  if (policy.security?.tenantBoundaryRequired !== true) findings.push('policy-tenant-boundary-required');
  if (policy.security?.productionIdentifiersInRepositoryAllowed !== false) findings.push('policy-production-identifiers-in-repo-must-be-forbidden');
  if (policy.security?.personalDataInCiLogsAllowed !== false) findings.push('policy-personal-data-in-ci-must-be-forbidden');

  if (typeof document.completedAt === 'string' && Number.isNaN(Date.parse(document.completedAt))) {
    findings.push('invalid-timestamp:completedAt');
  }
  if (document.followUpRequired === true && document.followUpReferencePresent !== true) {
    findings.push('follow-up-reference-required');
  }

  for (const [field, value] of Object.entries(document)) {
    if (typeof value !== 'string') continue;
    for (const pattern of sensitivePatterns) {
      if (pattern.test(value)) {
        findings.push(`sensitive-long-running-value:${field}`);
        break;
      }
    }
  }

  return {
    status: findings.length === 0 ? 'LONG_RUNNING_PROCESSING_EVIDENCE_PASSED' : 'LONG_RUNNING_PROCESSING_EVIDENCE_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export async function runLongRunningProcessingEvidenceCheck({
  evidencePath,
  policyPath = 'ops/long-running-processing-policy.json',
  log = console.log,
} = {}) {
  if (!evidencePath) throw new Error('Long-running processing evidence path is required');
  const [document, policy] = await Promise.all([readJson(evidencePath), readJson(policyPath)]);
  const result = validateLongRunningProcessingEvidence(document, policy);
  log(JSON.stringify(result, null, 2));
  if (!result.complete) throw new Error(`Long-running processing evidence check failed (${result.findings.length})`);
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
  return { status: 'LONG_RUNNING_PROCESSING_EVIDENCE_FAILED', complete: false, findings: [rule] };
}

if (isMainModule(import.meta.url)) {
  runLongRunningProcessingEvidenceCheck({ evidencePath: process.argv[2] }).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Long-running processing evidence check failed');
    process.exitCode = 1;
  });
}
