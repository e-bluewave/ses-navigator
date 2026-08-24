import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

export function validateLongRunningProcessingPolicy(policy) {
  const failures = [];
  const edge = policy?.edge ?? {};
  const worker = policy?.worker ?? {};
  const job = policy?.job ?? {};
  const retry = policy?.retry ?? {};
  const monitoring = policy?.monitoring ?? {};
  const security = policy?.security ?? {};

  if (policy?.version !== 1) failures.push('policy version must be 1');
  if (policy?.scope !== 'long-running-processing-boundary') {
    failures.push('scope must be long-running-processing-boundary');
  }

  if (edge.expectedMaxSeconds !== 30) {
    failures.push('Edge expected maximum must be 30 seconds');
  }
  if (edge.cpuIntensiveAllowed !== false) {
    failures.push('CPU intensive work must be prohibited on Edge');
  }
  if (edge.largeFileTransformationAllowed !== false) {
    failures.push('large file transformation must be prohibited on Edge');
  }
  if (edge.restartRequiredAllowed !== false) {
    failures.push('restart-required work must be prohibited on Edge');
  }
  if (edge.safeRetryRequired !== true) {
    failures.push('safe retry is required for Edge work');
  }
  if (edge.partialBusinessStateAllowedOnTimeout !== false) {
    failures.push('partial business state on timeout must be prohibited');
  }

  if (worker.requiredWhenExpectedSecondsExceed !== 30) {
    failures.push('worker threshold must be greater than 30 seconds');
  }
  for (const [key, message] of [
    ['cpuIntensiveRequired', 'CPU intensive work must use a worker'],
    ['bulkProcessingRequired', 'bulk processing must use a worker'],
    ['largeFileProcessingRequired', 'large file processing must use a worker'],
    ['multiAiCallBatchRequired', 'multi AI-call batches must use a worker'],
    [
      'progressOrCancellationRequired',
      'progress or cancellation work must use a worker',
    ],
    [
      'retryOrDeadLetterRequired',
      'retry or dead-letter work must use a worker',
    ],
  ]) {
    if (worker[key] !== true) failures.push(message);
  }

  for (const [key, message] of [
    ['jobIdRequired', 'job ID is required'],
    ['tenantIdRequired', 'tenant ID is required'],
    ['jobTypeRequired', 'job type is required'],
    ['idempotencyKeyRequired', 'idempotency key is required'],
    ['attemptTrackingRequired', 'attempt tracking is required'],
    ['leaseRequired', 'job lease is required'],
    ['progressRequired', 'job progress is required'],
    ['deadLetterStateRequired', 'dead-letter state is required'],
  ]) {
    if (job[key] !== true) failures.push(message);
  }

  for (const [key, message] of [
    [
      'retryableVsPermanentClassificationRequired',
      'retryable and permanent errors must be classified',
    ],
    ['backoffRequired', 'retry backoff is required'],
    [
      'duplicateExecutionProtectionRequired',
      'duplicate execution protection is required',
    ],
    ['sideEffectIdempotencyRequired', 'side-effect idempotency is required'],
  ]) {
    if (retry[key] !== true) failures.push(message);
  }

  if (monitoring.trackedBy !== 'BA-013') {
    failures.push(
      'long-running processing monitoring must be tracked by BA-013',
    );
  }
  for (const [key, message] of [
    ['queueDepthRequired', 'queue depth monitoring is required'],
    ['oldestQueuedAgeRequired', 'oldest queued age monitoring is required'],
    ['runningDurationRequired', 'running duration monitoring is required'],
    [
      'retryFailureDeadLetterRequired',
      'retry failure dead-letter monitoring is required',
    ],
    ['expiredLeaseRequired', 'expired lease monitoring is required'],
  ]) {
    if (monitoring[key] !== true) failures.push(message);
  }

  for (const [key, message] of [
    [
      'productionSecretsInPayloadAllowed',
      'Production secrets in job payload must be prohibited',
    ],
    [
      'unnecessaryPersonalDataInPayloadAllowed',
      'unnecessary personal data in job payload must be prohibited',
    ],
    [
      'productionIdentifiersInRepositoryAllowed',
      'Production identifiers in repository must be prohibited',
    ],
    [
      'personalDataInCiLogsAllowed',
      'personal data in CI logs must be prohibited',
    ],
  ]) {
    if (security[key] !== false) failures.push(message);
  }
  if (security.tenantBoundaryRequired !== true) {
    failures.push('tenant boundary is required for jobs');
  }

  return {
    status:
      failures.length === 0
        ? 'LONG_RUNNING_PROCESSING_POLICY_PASSED'
        : 'LONG_RUNNING_PROCESSING_POLICY_FAILED',
    failures,
  };
}

export async function runLongRunningProcessingPolicyCheck({
  policyPath = 'ops/long-running-processing-policy.json',
  log = console.log,
} = {}) {
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  const result = validateLongRunningProcessingPolicy(policy);
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(
      `Long-running processing policy check failed (${result.failures.length})`,
    );
  }
  return result;
}

if (isMainModule(import.meta.url)) {
  runLongRunningProcessingPolicyCheck().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Long-running processing policy check failed',
    );
    process.exitCode = 1;
  });
}
