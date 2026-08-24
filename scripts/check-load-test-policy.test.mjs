import assert from 'node:assert/strict';
import test from 'node:test';

import { validateLoadTestPolicy } from './check-load-test-policy.mjs';

const policy = {
  version: 1,
  scope: 'pre-production-load-testing',
  workloadTargets: {
    status: 'deferred',
    concurrentUsers: null,
    projectsPerTenant: null,
    engineersPerTenant: null,
    companiesPerTenant: null,
    applicationsPerTenant: null,
    productionAcceptanceAllowedWithoutApprovedTargets: false,
  },
  data: {
    productionPersonalDataAllowed: false,
    anonymizedOrSyntheticOnly: true,
    productionSecretsAllowed: false,
    productionTargetAllowed: false,
  },
  requiredScenarios: [
    'project-list',
    'project-search',
    'engineer-list',
    'engineer-search',
    'company-list',
    'rls-tenant-isolation',
    'bulk-write',
    'month-end-finance-like-processing',
  ],
  measurements: {
    throughputRequired: true,
    p50LatencyRequired: true,
    p95LatencyRequired: true,
    p99LatencyRequired: true,
    errorRateRequired: true,
    databaseConnectionUsageRequired: true,
    slowSqlRequired: true,
    lockWaitRequired: true,
    jobBacklogRequired: true,
  },
  execution: {
    smokeRequired: true,
    baselineRequiredAfterTargetsApproved: true,
    peakRequiredAfterTargetsApproved: true,
    stressIsExploratory: true,
    recoveryRequired: true,
    rlsBoundaryViolationTolerance: 0,
  },
  coordination: {
    monitoringTrackedBy: 'BA-013',
    measuredBaselineRequiredForMonitoringThresholds: true,
    approvedWorkloadTargetsRequiredBeforeProductionGoLive: true,
  },
};

test('accepts deferred workload targets without inventing Production scale', () => {
  const result = validateLoadTestPolicy(policy);
  assert.equal(result.status, 'LOAD_TEST_POLICY_PASSED');
  assert.deepEqual(result.failures, []);
});

test('rejects guessed workload values while status is deferred', () => {
  const result = validateLoadTestPolicy({
    ...policy,
    workloadTargets: {
      ...policy.workloadTargets,
      concurrentUsers: 10,
      projectsPerTenant: 1000,
    },
  });
  assert.ok(
    result.failures.includes(
      'concurrentUsers must remain null while workload targets are deferred',
    ),
  );
  assert.ok(
    result.failures.includes(
      'projectsPerTenant must remain null while workload targets are deferred',
    ),
  );
});

test('rejects Production acceptance before targets are approved', () => {
  const result = validateLoadTestPolicy({
    ...policy,
    workloadTargets: {
      ...policy.workloadTargets,
      productionAcceptanceAllowedWithoutApprovedTargets: true,
    },
  });
  assert.ok(
    result.failures.includes(
      'Production acceptance must be prohibited without approved workload targets',
    ),
  );
});

test('rejects unsafe Production test data and target usage', () => {
  const result = validateLoadTestPolicy({
    ...policy,
    data: {
      ...policy.data,
      productionPersonalDataAllowed: true,
      productionSecretsAllowed: true,
      productionTargetAllowed: true,
    },
  });
  assert.ok(
    result.failures.includes('Production personal data must be prohibited'),
  );
  assert.ok(result.failures.includes('Production secrets must be prohibited'));
  assert.ok(result.failures.includes('Production target must be prohibited'));
});

test('requires zero RLS boundary violations and BA-013 coordination', () => {
  const result = validateLoadTestPolicy({
    ...policy,
    execution: { ...policy.execution, rlsBoundaryViolationTolerance: 1 },
    coordination: { ...policy.coordination, monitoringTrackedBy: 'BA-999' },
  });
  assert.ok(
    result.failures.includes('RLS boundary violation tolerance must be zero'),
  );
  assert.ok(
    result.failures.includes('load test monitoring must be tracked by BA-013'),
  );
});
