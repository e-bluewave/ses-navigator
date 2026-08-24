import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRpoRtoPolicy } from './check-rpo-rto-policy.mjs';

const policy = {
  version: 1,
  scope: 'business-rpo-rto',
  measurementSource: {
    restoreDrillTrackedBy: 'BA-008',
    databaseBackupTrackedBy: 'BA-006',
    storageBackupTrackedBy: 'BA-007',
    measuredValuesRequiredBeforeProduction: true,
  },
  tiers: {
    tier1: { rpoMinutes: 60, rtoMinutes: 240 },
    tier2: { rpoMinutes: 240, rtoMinutes: 480 },
    tier3: { rpoMinutes: 1440, rtoMinutes: 1440 },
  },
  domains: [
    { id: 'contracts', tier: 'tier1' },
    { id: 'invoices', tier: 'tier1' },
    { id: 'payments', tier: 'tier1' },
    { id: 'auth-and-membership', tier: 'tier1' },
    { id: 'projects-and-applications', tier: 'tier2' },
    { id: 'engineers-and-resumes', tier: 'tier2' },
    { id: 'companies-and-contacts', tier: 'tier2' },
    { id: 'audit-and-ai-execution', tier: 'tier3' },
  ],
  governance: {
    businessOwnerRequired: true,
    technicalOwnerRequired: true,
    annualReviewRequired: true,
    materialChangeReviewRequired: true,
    productionReleaseBlockedWhenMeasuredRpoExceedsTarget: true,
    productionReleaseBlockedWhenMeasuredRtoExceedsTarget: true,
    exceptionsRequireApprovalAndExpiry: true,
  },
};

test('accepts the reviewed RPO/RTO policy', () => {
  const result = validateRpoRtoPolicy(policy);
  assert.equal(result.status, 'RPO_RTO_POLICY_PASSED');
  assert.deepEqual(result.failures, []);
});

test('rejects drift in approved tier values', () => {
  const result = validateRpoRtoPolicy({
    ...policy,
    tiers: { ...policy.tiers, tier1: { rpoMinutes: 120, rtoMinutes: 240 } },
  });
  assert.ok(result.failures.includes('approved RPO/RTO tier values must not drift'));
});

test('rejects missing critical domain or tier downgrade', () => {
  const result = validateRpoRtoPolicy({
    ...policy,
    domains: policy.domains
      .filter((domain) => domain.id !== 'payments')
      .map((domain) =>
        domain.id === 'contracts' ? { ...domain, tier: 'tier2' } : domain,
      ),
  });
  assert.ok(result.failures.includes('required domain missing: payments'));
  assert.ok(result.failures.includes('contracts must remain tier1'));
});

test('requires measured values and release blocking governance', () => {
  const result = validateRpoRtoPolicy({
    ...policy,
    measurementSource: {
      ...policy.measurementSource,
      measuredValuesRequiredBeforeProduction: false,
    },
    governance: {
      ...policy.governance,
      productionReleaseBlockedWhenMeasuredRtoExceedsTarget: false,
    },
  });
  assert.ok(
    result.failures.includes('measured RPO/RTO values are required before Production'),
  );
  assert.ok(
    result.failures.includes('Production release must be blocked when measured RTO exceeds target'),
  );
});
