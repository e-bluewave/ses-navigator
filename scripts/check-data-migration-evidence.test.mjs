import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDataMigrationEvidence } from './check-data-migration-evidence.mjs';

const policy = {
  execution: {
    dryRunRequired: true,
    runIdRequired: true,
    stagingValidationRequired: true,
    productionManualBulkEditAllowed: false,
  },
  deduplication: {
    nameOnlyAutomaticMergeAllowed: false,
  },
  rollback: {
    fullTableDeleteAllowed: false,
    irreversibleSideEffectsAllowedInsideMigration: false,
  },
  validation: {
    rerunUnexpectedCreateTolerance: 0,
    tenantBoundaryViolationTolerance: 0,
  },
};

function validEvidence() {
  return {
    evidenceId: 'BA015-MIGRATION-20260825-01',
    environment: 'Staging',
    completedAt: '2026-08-25T16:30:00+09:00',
    sourceMappingReviewed: true,
    deduplicationRulesReviewed: true,
    stableSourceIdsUsedWhereAvailable: true,
    nameOnlyAutomaticMergeUsed: false,
    ambiguousMatchesManuallyReviewed: true,
    dryRunCompleted: true,
    executionCompleted: true,
    runIdRecorded: true,
    idempotentRerunVerified: true,
    rerunUnexpectedCreateCount: 0,
    partialFailuresVisible: true,
    inputChecksumVerified: true,
    countsVerified: true,
    referentialIntegrityPassed: true,
    tenantBoundaryViolationCount: 0,
    runScopedRollbackVerified: true,
    rollbackDryRunCompleted: true,
    fullTableDeleteUsed: false,
    irreversibleSideEffectsUsed: false,
    updatedRowRecoveryVerified: true,
    productionManualBulkEditUsed: false,
    productionIdentifiersRecorded: false,
    personalDataRecorded: false,
    secretOrPersonalDataExposed: false,
    secretFreeEvidence: true,
    followUpRequired: false,
    notes: 'Source-neutral migration evidence.',
  };
}

test('accepts complete BA-015 migration evidence', () => {
  const result = validateDataMigrationEvidence(validEvidence(), policy);
  assert.equal(result.status, 'DATA_MIGRATION_EVIDENCE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
});

test('rejects non-idempotent rerun and tenant violations', () => {
  const evidence = validEvidence();
  evidence.rerunUnexpectedCreateCount = 1;
  evidence.tenantBoundaryViolationCount = 1;
  const result = validateDataMigrationEvidence(evidence, policy);
  assert.ok(result.findings.includes('rerun-unexpected-create-tolerance-exceeded'));
  assert.ok(result.findings.includes('tenant-boundary-violation-tolerance-exceeded'));
});

test('rejects unsafe deduplication and rollback behaviors', () => {
  const evidence = validEvidence();
  evidence.nameOnlyAutomaticMergeUsed = true;
  evidence.fullTableDeleteUsed = true;
  evidence.irreversibleSideEffectsUsed = true;
  const result = validateDataMigrationEvidence(evidence, policy);
  assert.ok(result.findings.includes('nameOnlyAutomaticMergeUsed-must-be-false'));
  assert.ok(result.findings.includes('fullTableDeleteUsed-must-be-false'));
  assert.ok(result.findings.includes('irreversibleSideEffectsUsed-must-be-false'));
});

test('requires core migration policy safeguards', () => {
  const invalidPolicy = structuredClone(policy);
  invalidPolicy.execution.dryRunRequired = false;
  invalidPolicy.execution.productionManualBulkEditAllowed = true;
  invalidPolicy.deduplication.nameOnlyAutomaticMergeAllowed = true;
  invalidPolicy.rollback.fullTableDeleteAllowed = true;
  const result = validateDataMigrationEvidence(validEvidence(), invalidPolicy);
  assert.ok(result.findings.includes('policy-dry-run-required'));
  assert.ok(
    result.findings.includes(
      'policy-production-manual-bulk-edit-must-be-forbidden',
    ),
  );
  assert.ok(
    result.findings.includes('policy-name-only-auto-merge-must-be-forbidden'),
  );
  assert.ok(result.findings.includes('policy-full-table-delete-must-be-forbidden'));
});

test('requires follow-up reference when follow-up is required', () => {
  const evidence = validEvidence();
  evidence.followUpRequired = true;
  evidence.followUpReferencePresent = false;
  const result = validateDataMigrationEvidence(evidence, policy);
  assert.ok(result.findings.includes('follow-up-reference-required'));
});

test('rejects invalid timestamp, unknown field, and sensitive value', () => {
  const evidence = validEvidence();
  evidence.completedAt = 'invalid';
  evidence.notes = 'postgresql://example.invalid';
  evidence.projectRef = 'must-not-be-recorded';
  const result = validateDataMigrationEvidence(evidence, policy);
  assert.ok(result.findings.includes('invalid-timestamp:completedAt'));
  assert.ok(result.findings.includes('sensitive-data-migration-value:notes'));
  assert.ok(result.findings.includes('unknown-field:projectRef'));
});
