import assert from 'node:assert/strict';
import test from 'node:test';

import { validateLongRunningProcessingEvidence } from './check-long-running-processing-evidence.mjs';

const policy = {
  edge: {
    expectedMaxSeconds: 30,
    cpuIntensiveAllowed: false,
    largeFileTransformationAllowed: false,
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

function validEvidence() {
  return {
    evidenceId: 'BA017-WORKER-20260825-01',
    environment: 'Staging',
    completedAt: '2026-08-25T17:30:00+09:00',
    edgeThirtySecondBoundaryValidated: true,
    longTaskRoutedToWorker: true,
    cpuHeavyTaskRoutedToWorker: true,
    bulkTaskRoutedToWorker: true,
    largeFileTaskRoutedToWorker: true,
    multiAiBatchRoutedToWorker: true,
    progressAndCancellationValidated: true,
    jobIdValidated: true,
    tenantIdValidated: true,
    jobTypeValidated: true,
    idempotencyKeyValidated: true,
    attemptTrackingValidated: true,
    leaseValidated: true,
    progressStateValidated: true,
    deadLetterStateValidated: true,
    retryClassificationValidated: true,
    backoffValidated: true,
    duplicateExecutionProtectionValidated: true,
    sideEffectIdempotencyValidated: true,
    timeoutLeavesNoPartialBusinessState: true,
    workerInterruptionRecoveryValidated: true,
    restartRecoveryValidated: true,
    expiredLeaseRecoveryValidated: true,
    deadLetterFlowValidated: true,
    monitoringSignalsValidated: true,
    tenantBoundaryValidated: true,
    secretFreeEvidence: true,
    productionSecretsInPayload: false,
    unnecessaryPersonalDataInPayload: false,
    productionIdentifiersRecorded: false,
    personalDataRecorded: false,
    personalDataInCiLogs: false,
    followUpRequired: false,
    notes: 'Provider-neutral long-running processing evidence.',
  };
}

test('accepts complete BA-017 evidence', () => {
  const result = validateLongRunningProcessingEvidence(validEvidence(), policy);
  assert.equal(result.status, 'LONG_RUNNING_PROCESSING_EVIDENCE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
});

test('requires worker recovery and duplicate protections', () => {
  const evidence = validEvidence();
  evidence.workerInterruptionRecoveryValidated = false;
  evidence.restartRecoveryValidated = false;
  evidence.duplicateExecutionProtectionValidated = false;
  const result = validateLongRunningProcessingEvidence(evidence, policy);
  assert.ok(result.findings.includes('workerInterruptionRecoveryValidated-must-be-true'));
  assert.ok(result.findings.includes('restartRecoveryValidated-must-be-true'));
  assert.ok(result.findings.includes('duplicateExecutionProtectionValidated-must-be-true'));
});

test('requires dead-letter and timeout safety', () => {
  const evidence = validEvidence();
  evidence.deadLetterFlowValidated = false;
  evidence.timeoutLeavesNoPartialBusinessState = false;
  const result = validateLongRunningProcessingEvidence(evidence, policy);
  assert.ok(result.findings.includes('deadLetterFlowValidated-must-be-true'));
  assert.ok(result.findings.includes('timeoutLeavesNoPartialBusinessState-must-be-true'));
});

test('rejects unsafe policy changes', () => {
  const invalidPolicy = structuredClone(policy);
  invalidPolicy.edge.expectedMaxSeconds = 60;
  invalidPolicy.edge.cpuIntensiveAllowed = true;
  invalidPolicy.retry.duplicateExecutionProtectionRequired = false;
  invalidPolicy.security.tenantBoundaryRequired = false;
  const result = validateLongRunningProcessingEvidence(validEvidence(), invalidPolicy);
  assert.ok(result.findings.includes('policy-edge-budget-must-be-30-seconds'));
  assert.ok(result.findings.includes('policy-edge-cpu-intensive-must-be-forbidden'));
  assert.ok(result.findings.includes('policy-retry-duplicateExecutionProtectionRequired-must-be-true'));
  assert.ok(result.findings.includes('policy-tenant-boundary-required'));
});

test('rejects sensitive evidence and missing follow-up', () => {
  const evidence = validEvidence();
  evidence.notes = 'postgresql://example.invalid';
  evidence.followUpRequired = true;
  evidence.followUpReferencePresent = false;
  const result = validateLongRunningProcessingEvidence(evidence, policy);
  assert.ok(result.findings.includes('sensitive-long-running-value:notes'));
  assert.ok(result.findings.includes('follow-up-reference-required'));
});
