import assert from 'node:assert/strict';
import test from 'node:test';

import { validateMonitoringPolicy } from './check-monitoring-policy.mjs';

const policy = {
  version: 1,
  scope: 'production-operational-monitoring',
  providerSelection: 'deferred',
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
    severityLevels: ['critical', 'warning', 'info'],
    criticalRequiresImmediateNotification: true,
    warningRequiresNotification: true,
    deduplicationRequired: true,
    recoveryNotificationRequired: true,
    ownerRequired: true,
  },
  initialThresholds: {
    slowSqlMilliseconds: 1000,
    connectionUsageWarningPercent: 70,
    connectionUsageCriticalPercent: 85,
    databaseCapacityWarningPercent: 70,
    databaseCapacityCriticalPercent: 85,
    lockWaitWarningSeconds: 10,
    jobBacklogWarningCount: 100,
    jobOldestAgeWarningMinutes: 15,
  },
  security: {
    secretsInAlertsAllowed: false,
    personalDataInAlertsAllowed: false,
    productionIdentifiersInRepositoryAllowed: false,
    queryParameterValuesInAlertsAllowed: false,
  },
  operations: {
    runbookRequired: true,
    testAlertRequiredBeforeProduction: true,
    quarterlyReviewRequired: true,
    thresholdsMustBeTunedFromMeasuredBaseline: true,
    alertEvidenceRequired: true,
  },
};

test('accepts reviewed monitoring policy', () => {
  const result = validateMonitoringPolicy(policy);
  assert.equal(result.status, 'MONITORING_POLICY_PASSED');
  assert.deepEqual(result.failures, []);
});

test('rejects missing monitoring signals', () => {
  const result = validateMonitoringPolicy({
    ...policy,
    signals: { ...policy.signals, databaseLocks: false, rlsLoad: false },
  });
  assert.ok(result.failures.includes('required monitoring signal missing: databaseLocks'));
  assert.ok(result.failures.includes('required monitoring signal missing: rlsLoad'));
});

test('rejects alert secret exposure and missing notification controls', () => {
  const result = validateMonitoringPolicy({
    ...policy,
    alerting: { ...policy.alerting, recoveryNotificationRequired: false },
    security: { ...policy.security, secretsInAlertsAllowed: true, personalDataInAlertsAllowed: true },
  });
  assert.ok(result.failures.includes('recovery notification is required'));
  assert.ok(result.failures.includes('secrets in alerts must be prohibited'));
  assert.ok(result.failures.includes('personal data in alerts must be prohibited'));
});

test('rejects initial threshold drift', () => {
  const result = validateMonitoringPolicy({
    ...policy,
    initialThresholds: { ...policy.initialThresholds, connectionUsageCriticalPercent: 95 },
  });
  assert.ok(result.failures.includes('connectionUsageCriticalPercent approved initial threshold must not drift'));
});
