import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDataMigrationPolicy } from './check-data-migration-policy.mjs';

const policy = {
  version: 1,
  scope: 'initial-data-migration',
  execution: {
    dryRunRequired: true,
    runIdRequired: true,
    stagingValidationRequired: true,
    productionManualBulkEditAllowed: false,
    rerunMustBeIdempotent: true,
    partialSuccessMustBeVisible: true,
  },
  deduplication: {
    rulesRequiredPerDataType: true,
    stableSourceIdPreferred: true,
    nameOnlyAutomaticMergeAllowed: false,
    manualReviewPathRequiredForAmbiguousMatches: true,
  },
  rollback: {
    runScopedRollbackRequired: true,
    rollbackDryRunRequired: true,
    fullTableDeleteAllowed: false,
    irreversibleSideEffectsAllowedInsideMigration: false,
    updatedRowRecoveryRequired: true,
  },
  validation: {
    inputChecksumRequired: true,
    createdUpdatedSkippedRejectedCountsRequired: true,
    referentialIntegrityRequired: true,
    tenantBoundaryValidationRequired: true,
    rerunUnexpectedCreateTolerance: 0,
    tenantBoundaryViolationTolerance: 0,
  },
  security: {
    productionSecretsInRepositoryAllowed: false,
    productionIdentifiersInRepositoryAllowed: false,
    personalDataInRepositoryAllowed: false,
    personalDataInCiLogsAllowed: false,
  },
  sourceMapping: {
    status: 'deferred-until-source-confirmed',
    actualSourceSystem: null,
    actualFileNames: null,
    actualDeduplicationKeys: null,
  },
};

test('accepts reviewed initial data migration policy', () => {
  const result = validateDataMigrationPolicy(policy);
  assert.equal(result.status, 'DATA_MIGRATION_POLICY_PASSED');
  assert.deepEqual(result.failures, []);
});

test('rejects unsafe rerun and Production bulk edit behavior', () => {
  const result = validateDataMigrationPolicy({
    ...policy,
    execution: {
      ...policy.execution,
      productionManualBulkEditAllowed: true,
      rerunMustBeIdempotent: false,
    },
  });
  assert.ok(
    result.failures.includes('manual Production bulk edit must be prohibited'),
  );
  assert.ok(result.failures.includes('migration rerun must be idempotent'));
});

test('rejects weak duplicate matching', () => {
  const result = validateDataMigrationPolicy({
    ...policy,
    deduplication: {
      ...policy.deduplication,
      nameOnlyAutomaticMergeAllowed: true,
      manualReviewPathRequiredForAmbiguousMatches: false,
    },
  });
  assert.ok(
    result.failures.includes('name-only automatic merge must be prohibited'),
  );
  assert.ok(
    result.failures.includes('ambiguous matches require a manual review path'),
  );
});

test('rejects unsafe rollback controls', () => {
  const result = validateDataMigrationPolicy({
    ...policy,
    rollback: {
      ...policy.rollback,
      fullTableDeleteAllowed: true,
      irreversibleSideEffectsAllowedInsideMigration: true,
    },
  });
  assert.ok(
    result.failures.includes('full-table delete rollback must be prohibited'),
  );
  assert.ok(
    result.failures.includes(
      'irreversible side effects inside migration must be prohibited',
    ),
  );
});

test('requires zero unexpected creates and tenant violations', () => {
  const result = validateDataMigrationPolicy({
    ...policy,
    validation: {
      ...policy.validation,
      rerunUnexpectedCreateTolerance: 1,
      tenantBoundaryViolationTolerance: 1,
    },
  });
  assert.ok(
    result.failures.includes('rerun unexpected create tolerance must be zero'),
  );
  assert.ok(
    result.failures.includes(
      'tenant boundary violation tolerance must be zero',
    ),
  );
});

test('keeps source-specific details empty while deferred', () => {
  const result = validateDataMigrationPolicy({
    ...policy,
    sourceMapping: {
      ...policy.sourceMapping,
      actualSourceSystem: 'example-source',
    },
  });
  assert.ok(
    result.failures.includes(
      'actualSourceSystem must remain null while source mapping is deferred',
    ),
  );
});
