import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRetentionPolicy } from './check-retention-policy.mjs';

const policy = {
  version: 1,
  scope: 'data-retention-and-disposal',
  jurisdiction: 'JP',
  review: {
    annualReviewRequired: true,
    legalChangeReviewRequired: true,
    businessOwnerRequired: true,
    privacyOwnerRequired: true,
  },
  globalRules: {
    legalHoldOverridesDeletion: true,
    deleteOrAnonymizeWhenPurposeEnds: true,
    backupExpiryMustNotReintroduceDeletedData: true,
    retentionMetadataRequired: true,
    deletionEvidenceRequired: true,
    productionIdentifiersInRepositoryAllowed: false,
    personalDataInRepositoryAllowed: false,
  },
  categories: [
    {
      id: 'audit-events',
      retentionDays: 1095,
      trigger: 'event-created-at',
      disposition: 'delete-or-irreversibly-anonymize',
      basis: 'security-audit-operational',
    },
    {
      id: 'transaction-emails',
      retentionYears: 7,
      trigger: 'applicable-tax-record-trigger',
      disposition: 'delete-after-retention-unless-legal-hold',
      basis: 'tax-electronic-transaction-record',
    },
    {
      id: 'general-business-emails',
      retentionDays: 1095,
      trigger: 'message-created-at',
      disposition: 'delete-after-retention-unless-legal-hold',
      basis: 'business-operational',
    },
    {
      id: 'ai-input-output',
      retentionDays: 365,
      trigger: 'execution-created-at',
      disposition: 'delete-or-irreversibly-anonymize',
      basis: 'quality-audit-operational',
    },
    {
      id: 'personal-data-default',
      maximumDaysAfterPurposeEnds: 90,
      trigger: 'business-purpose-ended-at',
      disposition: 'delete-or-irreversibly-anonymize',
      basis: 'appi-data-minimization',
    },
    {
      id: 'engineer-resumes',
      retentionDaysAfterRelationshipEnds: 365,
      trigger: 'last-active-proposal-or-relationship-ended-at',
      disposition: 'delete-or-irreversibly-anonymize',
      basis: 'ses-sales-operational-personal-data',
    },
    {
      id: 'contracts',
      retentionYears: 10,
      trigger: 'contract-ended-at',
      disposition: 'delete-after-retention-unless-legal-hold',
      basis: 'tax-and-business-record-conservative',
    },
    {
      id: 'invoices',
      retentionYears: 7,
      trigger: 'applicable-tax-record-trigger',
      disposition: 'delete-after-retention-unless-legal-hold',
      basis: 'invoice-tax-record',
    },
  ],
  exceptions: {
    approvalRequired: true,
    reasonRequired: true,
    expiryRequired: true,
    legalHoldOwnerRequired: true,
  },
};

test('accepts the reviewed retention policy', () => {
  const result = validateRetentionPolicy(policy);
  assert.equal(result.status, 'RETENTION_POLICY_PASSED');
  assert.deepEqual(result.failures, []);
});

test('rejects statutory and approved retention drift', () => {
  const result = validateRetentionPolicy({
    ...policy,
    categories: policy.categories.map((category) => {
      if (category.id === 'invoices') return { ...category, retentionYears: 5 };
      if (category.id === 'contracts')
        return { ...category, retentionYears: 7 };
      return category;
    }),
  });
  assert.ok(
    result.failures.includes(
      'invoices approved retention value must not drift',
    ),
  );
  assert.ok(
    result.failures.includes(
      'contracts approved retention value must not drift',
    ),
  );
});

test('requires purpose-ended deletion and legal hold', () => {
  const result = validateRetentionPolicy({
    ...policy,
    globalRules: {
      ...policy.globalRules,
      legalHoldOverridesDeletion: false,
      deleteOrAnonymizeWhenPurposeEnds: false,
    },
  });
  assert.ok(result.failures.includes('legal hold must override deletion'));
  assert.ok(
    result.failures.includes(
      'purpose-ended personal data must be deleted or anonymized',
    ),
  );
});

test('rejects missing category and repository exposure', () => {
  const result = validateRetentionPolicy({
    ...policy,
    categories: policy.categories.filter(
      (category) => category.id !== 'engineer-resumes',
    ),
    globalRules: {
      ...policy.globalRules,
      personalDataInRepositoryAllowed: true,
    },
  });
  assert.ok(
    result.failures.includes(
      'required retention category missing: engineer-resumes',
    ),
  );
  assert.ok(
    result.failures.includes('personal data must not be stored in repository'),
  );
});
