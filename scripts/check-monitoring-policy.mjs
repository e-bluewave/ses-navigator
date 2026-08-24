import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const REQUIRED_SIGNALS = [
  'applicationErrors',
  'slowSql',
  'databaseConnections',
  'databaseCapacity',
  'databaseLocks',
  'rlsLoad',
  'jobBacklog',
];

export function validateMonitoringPolicy(policy) {
  const failures = [];
  const signals = policy?.signals ?? {};
  const alerting = policy?.alerting ?? {};
  const thresholds = policy?.initialThresholds ?? {};
  const security = policy?.security ?? {};
  const operations = policy?.operations ?? {};

  if (policy?.version !== 1) failures.push('policy version must be 1');
  if (policy?.scope !== 'production-operational-monitoring') {
    failures.push('scope must be production-operational-monitoring');
  }
  if (policy?.providerSelection !== 'deferred') {
    failures.push('monitoring provider selection must remain deferred');
  }

  for (const signal of REQUIRED_SIGNALS) {
    if (signals[signal] !== true)
      failures.push(`required monitoring signal missing: ${signal}`);
  }

  const severities = new Set(alerting.severityLevels ?? []);
  for (const severity of ['critical', 'warning', 'info']) {
    if (!severities.has(severity))
      failures.push(`severity level missing: ${severity}`);
  }
  if (alerting.criticalRequiresImmediateNotification !== true)
    failures.push('critical notification is required');
  if (alerting.warningRequiresNotification !== true)
    failures.push('warning notification is required');
  if (alerting.deduplicationRequired !== true)
    failures.push('alert deduplication is required');
  if (alerting.recoveryNotificationRequired !== true)
    failures.push('recovery notification is required');
  if (alerting.ownerRequired !== true)
    failures.push('alert owner is required');

  const expected = {
    slowSqlMilliseconds: 1000,
    connectionUsageWarningPercent: 70,
    connectionUsageCriticalPercent: 85,
    databaseCapacityWarningPercent: 70,
    databaseCapacityCriticalPercent: 85,
    lockWaitWarningSeconds: 10,
    jobBacklogWarningCount: 100,
    jobOldestAgeWarningMinutes: 15,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (thresholds[key] !== value)
      failures.push(`${key} approved initial threshold must not drift`);
  }

  if (security.secretsInAlertsAllowed !== false)
    failures.push('secrets in alerts must be prohibited');
  if (security.personalDataInAlertsAllowed !== false)
    failures.push('personal data in alerts must be prohibited');
  if (security.productionIdentifiersInRepositoryAllowed !== false)
    failures.push('Production identifiers must not be stored in repository');
  if (security.queryParameterValuesInAlertsAllowed !== false)
    failures.push('query parameter values in alerts must be prohibited');

  if (operations.runbookRequired !== true)
    failures.push('monitoring runbook is required');
  if (operations.testAlertRequiredBeforeProduction !== true)
    failures.push('test alert before Production is required');
  if (operations.quarterlyReviewRequired !== true)
    failures.push('quarterly monitoring review is required');
  if (operations.thresholdsMustBeTunedFromMeasuredBaseline !== true)
    failures.push('thresholds must be tuned from measured baseline');
  if (operations.alertEvidenceRequired !== true)
    failures.push('alert evidence is required');

  return {
    status:
      failures.length === 0
        ? 'MONITORING_POLICY_PASSED'
        : 'MONITORING_POLICY_FAILED',
    failures,
  };
}

export async function runMonitoringPolicyCheck({
  policyPath = 'ops/monitoring-policy.json',
  log = console.log,
} = {}) {
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  const result = validateMonitoringPolicy(policy);
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(
      `Monitoring policy check failed (${result.failures.length})`,
    );
  }
  return result;
}

if (isMainModule(import.meta.url)) {
  runMonitoringPolicyCheck().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Monitoring policy check failed',
    );
    process.exitCode = 1;
  });
}
