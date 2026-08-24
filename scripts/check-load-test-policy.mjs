import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const REQUIRED_SCENARIOS = [
  'project-list',
  'project-search',
  'engineer-list',
  'engineer-search',
  'company-list',
  'rls-tenant-isolation',
  'bulk-write',
  'month-end-finance-like-processing',
];

const DEFERRED_TARGET_KEYS = [
  'concurrentUsers',
  'projectsPerTenant',
  'engineersPerTenant',
  'companiesPerTenant',
  'applicationsPerTenant',
];

export function validateLoadTestPolicy(policy) {
  const failures = [];
  const workload = policy?.workloadTargets ?? {};
  const data = policy?.data ?? {};
  const scenarios = new Set(policy?.requiredScenarios ?? []);
  const measurements = policy?.measurements ?? {};
  const execution = policy?.execution ?? {};
  const coordination = policy?.coordination ?? {};

  if (policy?.version !== 1) failures.push('policy version must be 1');
  if (policy?.scope !== 'pre-production-load-testing') {
    failures.push('scope must be pre-production-load-testing');
  }

  if (workload.status !== 'deferred') {
    failures.push('workload targets must remain deferred until approved');
  }
  for (const key of DEFERRED_TARGET_KEYS) {
    if (workload[key] !== null) {
      failures.push(
        `${key} must remain null while workload targets are deferred`,
      );
    }
  }
  if (workload.productionAcceptanceAllowedWithoutApprovedTargets !== false) {
    failures.push(
      'Production acceptance must be prohibited without approved workload targets',
    );
  }

  if (data.productionPersonalDataAllowed !== false) {
    failures.push('Production personal data must be prohibited');
  }
  if (data.anonymizedOrSyntheticOnly !== true) {
    failures.push('load test data must be anonymized or synthetic');
  }
  if (data.productionSecretsAllowed !== false) {
    failures.push('Production secrets must be prohibited');
  }
  if (data.productionTargetAllowed !== false) {
    failures.push('Production target must be prohibited');
  }

  for (const scenario of REQUIRED_SCENARIOS) {
    if (!scenarios.has(scenario))
      failures.push(`required load test scenario missing: ${scenario}`);
  }

  for (const key of [
    'throughputRequired',
    'p50LatencyRequired',
    'p95LatencyRequired',
    'p99LatencyRequired',
    'errorRateRequired',
    'databaseConnectionUsageRequired',
    'slowSqlRequired',
    'lockWaitRequired',
    'jobBacklogRequired',
  ]) {
    if (measurements[key] !== true)
      failures.push(`required measurement missing: ${key}`);
  }

  if (execution.smokeRequired !== true) failures.push('smoke test is required');
  if (execution.baselineRequiredAfterTargetsApproved !== true) {
    failures.push('baseline test must be required after targets are approved');
  }
  if (execution.peakRequiredAfterTargetsApproved !== true) {
    failures.push('peak test must be required after targets are approved');
  }
  if (execution.stressIsExploratory !== true) {
    failures.push('stress test must remain exploratory');
  }
  if (execution.recoveryRequired !== true)
    failures.push('recovery test is required');
  if (execution.rlsBoundaryViolationTolerance !== 0) {
    failures.push('RLS boundary violation tolerance must be zero');
  }

  if (coordination.monitoringTrackedBy !== 'BA-013') {
    failures.push('load test monitoring must be tracked by BA-013');
  }
  if (coordination.measuredBaselineRequiredForMonitoringThresholds !== true) {
    failures.push('measured baseline must feed monitoring thresholds');
  }
  if (
    coordination.approvedWorkloadTargetsRequiredBeforeProductionGoLive !== true
  ) {
    failures.push(
      'approved workload targets are required before Production go-live',
    );
  }

  return {
    status:
      failures.length === 0
        ? 'LOAD_TEST_POLICY_PASSED'
        : 'LOAD_TEST_POLICY_FAILED',
    failures,
  };
}

export async function runLoadTestPolicyCheck({
  policyPath = 'ops/load-test-policy.json',
  log = console.log,
} = {}) {
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  const result = validateLoadTestPolicy(policy);
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(
      `Load test policy check failed (${result.failures.length})`,
    );
  }
  return result;
}

if (isMainModule(import.meta.url)) {
  runLoadTestPolicyCheck().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Load test policy check failed',
    );
    process.exitCode = 1;
  });
}
