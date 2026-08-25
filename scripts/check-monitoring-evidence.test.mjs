import assert from 'node:assert/strict';
import test from 'node:test';

import { validateMonitoringEvidence } from './check-monitoring-evidence.mjs';

const policy = {
  signals: {
    applicationErrors: true,
    slowSql: true,
    databaseConnections: true,
    databaseCapacity: true,
    databaseLocks: true,
    rlsLoad: true,
    jobBacklog: true,
  },
  alerting: {
    criticalRequiresImmediateNotification: true,
    warningRequiresNotification: true,
    deduplicationRequired: true,
    recoveryNotificationRequired: true,
  },
  operations: {
    testAlertRequiredBeforeProduction: true,
    thresholdsMustBeTunedFromMeasuredBaseline: true,
  },
};

function validEvidence() {
  return {
    evidenceId: 'BA013-MONITORING-20260825-01',
    environment: 'Staging',
    completedAt: '2026-08-25T16:00:00+09:00',
    allRequiredSignalsObserved: true,
    criticalAlertDelivered: true,
    warningAlertDelivered: true,
    deduplicationVerified: true,
    recoveryNotificationVerified: true,
    ownerRoutingVerified: true,
    testAlertCompleted: true,
    measuredBaselineCaptured: true,
    thresholdReviewCompleted: true,
    runbookLinked: true,
    quarterlyReviewScheduled: true,
    secretsInAlerts: false,
    personalDataInAlerts: false,
    queryParameterValuesInAlerts: false,
    productionIdentifiersRecorded: false,
    secretFreeEvidence: true,
    followUpRequired: false,
    notes: 'Provider-neutral monitoring evidence.',
  };
}

test('accepts complete BA-013 monitoring evidence', () => {
  const result = validateMonitoringEvidence(validEvidence(), policy);
  assert.equal(result.status, 'MONITORING_EVIDENCE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
});

test('requires alert delivery, deduplication, recovery, and routing', () => {
  const evidence = validEvidence();
  evidence.criticalAlertDelivered = false;
  evidence.deduplicationVerified = false;
  evidence.recoveryNotificationVerified = false;
  evidence.ownerRoutingVerified = false;
  const result = validateMonitoringEvidence(evidence, policy);
  assert.ok(result.findings.includes('criticalAlertDelivered-must-be-true'));
  assert.ok(result.findings.includes('deduplicationVerified-must-be-true'));
  assert.ok(result.findings.includes('recoveryNotificationVerified-must-be-true'));
  assert.ok(result.findings.includes('ownerRoutingVerified-must-be-true'));
});

test('rejects sensitive alert content and Production identifiers', () => {
  const evidence = validEvidence();
  evidence.secretsInAlerts = true;
  evidence.personalDataInAlerts = true;
  evidence.queryParameterValuesInAlerts = true;
  evidence.productionIdentifiersRecorded = true;
  const result = validateMonitoringEvidence(evidence, policy);
  assert.ok(result.findings.includes('secretsInAlerts-must-be-false'));
  assert.ok(result.findings.includes('personalDataInAlerts-must-be-false'));
  assert.ok(result.findings.includes('queryParameterValuesInAlerts-must-be-false'));
  assert.ok(result.findings.includes('productionIdentifiersRecorded-must-be-false'));
});

test('requires all monitoring signals in policy', () => {
  const invalidPolicy = structuredClone(policy);
  invalidPolicy.signals.rlsLoad = false;
  const result = validateMonitoringEvidence(validEvidence(), invalidPolicy);
  assert.ok(result.findings.includes('policy-signal-required:rlsLoad'));
});

test('requires policy notification and baseline safeguards', () => {
  const invalidPolicy = structuredClone(policy);
  invalidPolicy.alerting.recoveryNotificationRequired = false;
  invalidPolicy.operations.testAlertRequiredBeforeProduction = false;
  invalidPolicy.operations.thresholdsMustBeTunedFromMeasuredBaseline = false;
  const result = validateMonitoringEvidence(validEvidence(), invalidPolicy);
  assert.ok(result.findings.includes('policy-recovery-notification-required'));
  assert.ok(result.findings.includes('policy-test-alert-required'));
  assert.ok(result.findings.includes('policy-measured-baseline-required'));
});

test('rejects invalid timestamp, sensitive value, and missing follow-up reference', () => {
  const evidence = validEvidence();
  evidence.completedAt = 'invalid';
  evidence.notes = 'postgresql://example.invalid';
  evidence.followUpRequired = true;
  evidence.followUpReferencePresent = false;
  const result = validateMonitoringEvidence(evidence, policy);
  assert.ok(result.findings.includes('invalid-timestamp:completedAt'));
  assert.ok(result.findings.includes('sensitive-monitoring-value:notes'));
  assert.ok(result.findings.includes('follow-up-reference-required'));
});
