import assert from 'node:assert/strict';
import test from 'node:test';

import { validateLongRunningProcessingPolicy } from './check-long-running-processing-policy.mjs';

const policy = {
  version: 1,
  scope: 'long-running-processing-boundary',
  edge: {
    expectedMaxSeconds: 30,
    cpuIntensiveAllowed: false,
    largeFileTransformationAllowed: false,
    restartRequiredAllowed: false,
    safeRetryRequired: true,
    partialBusinessStateAllowedOnTimeout: false,
  },
  worker: {
    requiredWhenExpectedSecondsExceed: 30,
    cpuIntensiveRequired: true,
    bulkProcessingRequired: true,
    largeFileProcessingRequired: true,
    multiAiCallBatchRequired: true,
    progressOrCancellationRequired: true,
    retryOrDeadLetterRequired: true,
  },
  job: {
    jobIdRequired: true,
    tenantIdRequired: true,
    jobTypeRequired: true,
    idempotencyKeyRequired: true,
    attemptTrackingRequired: true,
    leaseRequired: true,
    progressRequired: true,
    deadLetterStateRequired: true,
  },
  retry: {
    retryableVsPermanentClassificationRequired: true,
    backoffRequired: true,
    duplicateExecutionProtectionRequired: true,
    sideEffectIdempotencyRequired: true,
  },
  monitoring: {
    trackedBy: 'BA-013',
    queueDepthRequired: true,
    oldestQueuedAgeRequired: true,
    runningDurationRequired: true,
    retryFailureDeadLetterRequired: true,
    expiredLeaseRequired: true,
  },
  security: {
    productionSecretsInPayloadAllowed: false,
    unnecessaryPersonalDataInPayloadAllowed: false,
    tenantBoundaryRequired: true,
    productionIdentifiersInRepositoryAllowed: false,
    personalDataInCiLogsAllowed: false,
  },
};

test('accepts reviewed long-running processing policy', () => {
  const result = validateLongRunningProcessingPolicy(policy);
  assert.equal(result.status, 'LONG_RUNNING_PROCESSING_POLICY_PASSED');
  assert.deepEqual(result.failures, []);
});

test('rejects long or CPU-intensive work on Edge', () => {
  const result = validateLongRunningProcessingPolicy({
    ...policy,
    edge: {
      ...policy.edge,
      expectedMaxSeconds: 60,
      cpuIntensiveAllowed: true,
    },
  });
  assert.ok(result.failures.includes('Edge expected maximum must be 30 seconds'));
  assert.ok(
    result.failures.includes('CPU intensive work must be prohibited on Edge'),
  );
});

test('requires worker boundary and dead-letter behavior', () => {
  const result = validateLongRunningProcessingPolicy({
    ...policy,
    worker: {
      ...policy.worker,
      bulkProcessingRequired: false,
      retryOrDeadLetterRequired: false,
    },
  });
  assert.ok(result.failures.includes('bulk processing must use a worker'));
  assert.ok(
    result.failures.includes('retry or dead-letter work must use a worker'),
  );
});

test('requires idempotency and duplicate execution protection', () => {
  const result = validateLongRunningProcessingPolicy({
    ...policy,
    job: { ...policy.job, idempotencyKeyRequired: false },
    retry: {
      ...policy.retry,
      duplicateExecutionProtectionRequired: false,
      sideEffectIdempotencyRequired: false,
    },
  });
  assert.ok(result.failures.includes('idempotency key is required'));
  assert.ok(
    result.failures.includes('duplicate execution protection is required'),
  );
  assert.ok(result.failures.includes('side-effect idempotency is required'));
});

test('requires BA-013 monitoring and secure payload rules', () => {
  const result = validateLongRunningProcessingPolicy({
    ...policy,
    monitoring: { ...policy.monitoring, trackedBy: 'BA-999' },
    security: {
      ...policy.security,
      productionSecretsInPayloadAllowed: true,
      tenantBoundaryRequired: false,
    },
  });
  assert.ok(
    result.failures.includes(
      'long-running processing monitoring must be tracked by BA-013',
    ),
  );
  assert.ok(
    result.failures.includes(
      'Production secrets in job payload must be prohibited',
    ),
  );
  assert.ok(result.failures.includes('tenant boundary is required for jobs'));
});
