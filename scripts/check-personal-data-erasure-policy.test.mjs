import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePersonalDataErasurePolicy } from './check-personal-data-erasure-policy.mjs';

const policy = {
  version: 1,
  scope: 'personal-data-erasure-and-anonymization',
  jurisdiction: 'JP',
  retentionPolicyTrackedBy: 'BA-010',
  purposeEndedDeletionDeadlineDays: 90,
  allowedDispositionModes: ['hard-delete', 'irreversible-anonymization'],
  prohibitedAsDeletionSubstitutes: [
    'masking-only',
    'pseudonymization-only',
    'soft-delete-only',
  ],
  anonymization: {
    mustBeIrreversible: true,
    reidentificationKeyAllowed: false,
    directIdentifiersRemoved: true,
    linkableIdentifiersRemovedOrGeneralized: true,
    verificationRequired: true,
  },
  legalHold: {
    overridesDeletion: true,
    ownerRequired: true,
    reasonRequired: true,
    startedAtRequired: true,
    reviewAtRequired: true,
    indefiniteHoldWithoutReviewAllowed: false,
    holdDataAccessRestricted: true,
  },
  tenantTermination: {
    accessRevocationRequired: true,
    newWritesBlockedRequired: true,
    inventoryRequired: true,
    retentionClassificationRequired: true,
    purgeOrAnonymizeNonHeldDataWithinPurposeDeadline: true,
    storageObjectsIncluded: true,
    integrationCredentialsRevoked: true,
    webhooksAndTokensRevoked: true,
  },
  execution: {
    deletionRequestIdRequired: true,
    dryRunInventoryRequired: true,
    databaseDeletionRequired: true,
    storageDeletionRequired: true,
    searchOrDerivedDataDeletionRequired: true,
    backupTombstoneLedgerRequired: true,
    restoreReapplyDeletionRequired: true,
    deletionEvidenceRequired: true,
    evidenceMustExcludePersonalData: true,
  },
  governance: {
    privacyOwnerRequired: true,
    technicalOwnerRequired: true,
    annualReviewRequired: true,
    legalChangeReviewRequired: true,
    productionIdentifiersInRepositoryAllowed: false,
    personalDataInRepositoryAllowed: false,
  },
};

test('accepts reviewed BA-011 policy', () => {
  const result = validatePersonalDataErasurePolicy(policy);
  assert.equal(result.status, 'PERSONAL_DATA_ERASURE_POLICY_PASSED');
  assert.deepEqual(result.failures, []);
});

test('rejects reversible or masking-only deletion design', () => {
  const result = validatePersonalDataErasurePolicy({
    ...policy,
    prohibitedAsDeletionSubstitutes: ['masking-only'],
    anonymization: {
      ...policy.anonymization,
      reidentificationKeyAllowed: true,
    },
  });
  assert.ok(
    result.failures.includes('re-identification key must be prohibited'),
  );
  assert.ok(
    result.failures.includes(
      'prohibited deletion substitute missing: pseudonymization-only',
    ),
  );
  assert.ok(
    result.failures.includes(
      'prohibited deletion substitute missing: soft-delete-only',
    ),
  );
});

test('requires legal hold controls', () => {
  const result = validatePersonalDataErasurePolicy({
    ...policy,
    legalHold: {
      ...policy.legalHold,
      overridesDeletion: false,
      reviewAtRequired: false,
      indefiniteHoldWithoutReviewAllowed: true,
    },
  });
  assert.ok(result.failures.includes('legal hold must override deletion'));
  assert.ok(
    result.failures.includes('legal hold timestamps and review are required'),
  );
  assert.ok(
    result.failures.includes(
      'indefinite legal hold without review must be prohibited',
    ),
  );
});

test('requires tenant and backup deletion coverage', () => {
  const result = validatePersonalDataErasurePolicy({
    ...policy,
    tenantTermination: {
      ...policy.tenantTermination,
      storageObjectsIncluded: false,
    },
    execution: {
      ...policy.execution,
      backupTombstoneLedgerRequired: false,
      restoreReapplyDeletionRequired: false,
    },
  });
  assert.ok(
    result.failures.includes('tenant Storage objects must be included'),
  );
  assert.ok(result.failures.includes('backup tombstone ledger is required'));
  assert.ok(result.failures.includes('restore must reapply deletion ledger'));
});
