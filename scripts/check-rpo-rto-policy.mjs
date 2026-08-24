import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const REQUIRED_DOMAINS = new Set([
  'contracts',
  'invoices',
  'payments',
  'auth-and-membership',
  'projects-and-applications',
  'engineers-and-resumes',
  'companies-and-contacts',
  'audit-and-ai-execution',
]);

export function validateRpoRtoPolicy(policy) {
  const failures = [];
  const source = policy?.measurementSource ?? {};
  const tiers = policy?.tiers ?? {};
  const domains = Array.isArray(policy?.domains) ? policy.domains : [];
  const governance = policy?.governance ?? {};

  if (policy?.version !== 1) failures.push('policy version must be 1');
  if (policy?.scope !== 'business-rpo-rto') {
    failures.push('scope must be business-rpo-rto');
  }
  if (source.restoreDrillTrackedBy !== 'BA-008') {
    failures.push('restore drill measurements must be tracked by BA-008');
  }
  if (source.databaseBackupTrackedBy !== 'BA-006') {
    failures.push('database backup must be tracked by BA-006');
  }
  if (source.storageBackupTrackedBy !== 'BA-007') {
    failures.push('storage backup must be tracked by BA-007');
  }
  if (source.measuredValuesRequiredBeforeProduction !== true) {
    failures.push('measured RPO/RTO values are required before Production');
  }

  for (const [name, tier] of Object.entries(tiers)) {
    if (!Number.isInteger(tier?.rpoMinutes) || tier.rpoMinutes < 1) {
      failures.push(`${name} RPO must be a positive integer`);
    }
    if (!Number.isInteger(tier?.rtoMinutes) || tier.rtoMinutes < 1) {
      failures.push(`${name} RTO must be a positive integer`);
    }
  }

  if (
    tiers.tier1?.rpoMinutes !== 60 ||
    tiers.tier1?.rtoMinutes !== 240 ||
    tiers.tier2?.rpoMinutes !== 240 ||
    tiers.tier2?.rtoMinutes !== 480 ||
    tiers.tier3?.rpoMinutes !== 1440 ||
    tiers.tier3?.rtoMinutes !== 1440
  ) {
    failures.push('approved RPO/RTO tier values must not drift');
  }

  const domainIds = new Set(domains.map((domain) => domain?.id));
  for (const requiredDomain of REQUIRED_DOMAINS) {
    if (!domainIds.has(requiredDomain)) {
      failures.push(`required domain missing: ${requiredDomain}`);
    }
  }
  for (const domain of domains) {
    if (!Object.hasOwn(tiers, domain?.tier)) {
      failures.push(`unknown tier for domain: ${domain?.id ?? 'unknown'}`);
    }
  }

  const tier1Required = [
    'contracts',
    'invoices',
    'payments',
    'auth-and-membership',
  ];
  for (const id of tier1Required) {
    if (domains.find((domain) => domain.id === id)?.tier !== 'tier1') {
      failures.push(`${id} must remain tier1`);
    }
  }

  if (governance.businessOwnerRequired !== true) {
    failures.push('business owner is required');
  }
  if (governance.technicalOwnerRequired !== true) {
    failures.push('technical owner is required');
  }
  if (governance.annualReviewRequired !== true) {
    failures.push('annual RPO/RTO review is required');
  }
  if (governance.materialChangeReviewRequired !== true) {
    failures.push('material change review is required');
  }
  if (
    governance.productionReleaseBlockedWhenMeasuredRpoExceedsTarget !== true
  ) {
    failures.push(
      'Production release must be blocked when measured RPO exceeds target',
    );
  }
  if (
    governance.productionReleaseBlockedWhenMeasuredRtoExceedsTarget !== true
  ) {
    failures.push(
      'Production release must be blocked when measured RTO exceeds target',
    );
  }
  if (governance.exceptionsRequireApprovalAndExpiry !== true) {
    failures.push('RPO/RTO exceptions require approval and expiry');
  }

  return {
    status:
      failures.length === 0 ? 'RPO_RTO_POLICY_PASSED' : 'RPO_RTO_POLICY_FAILED',
    failures,
  };
}

export async function runRpoRtoPolicyCheck({
  policyPath = 'ops/rpo-rto-policy.json',
  log = console.log,
} = {}) {
  const policyText = await readFile(policyPath, 'utf8');
  const result = validateRpoRtoPolicy(JSON.parse(policyText));
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(`RPO/RTO policy check failed (${result.failures.length})`);
  }
  return result;
}

if (isMainModule(import.meta.url)) {
  runRpoRtoPolicyCheck().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'RPO/RTO policy check failed',
    );
    process.exitCode = 1;
  });
}
