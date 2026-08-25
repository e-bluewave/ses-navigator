import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRetentionEvidence } from './check-retention-evidence.mjs';

const policy = {
  globalRules: {
    legalHoldOverridesDeletion: true,
    backupExpiryMustNotReintroduceDeletedData: true,
    deletionEvidenceRequired: true,
  },
  categories: [{ id: 'audit-events' }, { id: 'contracts' }],
};

function validEvidence() {
  return {
    evidenceId: 'BA010-RETENTION-20260825-01',
    environment: 'Staging',
    completedAt: '2026-08-25T15:00:00+09:00',
    policyCategoriesValidated: true,
    expiredDataDeletedOrIrreversiblyAnonymized: true,
    legalHoldPreventsDeletion: true,
    legalHoldReleaseResumesDisposition: true,
    retentionTriggersValidated: true,
    backupRestoreReappliesDeletion: true,
    deletedDataReintroducedAfterRestore: false,
    productionIdentifiersRecorded: false,
    personalDataRecorded: false,
    secretOrPersonalDataExposed: false,
    secretFreeEvidence: true,
    followUpRequired: false,
    notes: 'Secret-free retention evidence.',
  };
}

test('accepts complete BA-010 retention evidence', () => {
  const result = validateRetentionEvidence(validEvidence(), policy);
  assert.equal(result.status, 'RETENTION_EVIDENCE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
});

test('rejects failed disposal and legal hold behavior', () => {
  const evidence = validEvidence();
  evidence.expiredDataDeletedOrIrreversiblyAnonymized = false;
  evidence.legalHoldPreventsDeletion = false;
  const result = validateRetentionEvidence(evidence, policy);
  assert.ok(
    result.findings.includes(
      'expiredDataDeletedOrIrreversiblyAnonymized-must-be-true',
    ),
  );
  assert.ok(result.findings.includes('legalHoldPreventsDeletion-must-be-true'));
});

test('rejects reintroduced deleted data and sensitive evidence', () => {
  const evidence = validEvidence();
  evidence.deletedDataReintroducedAfterRestore = true;
  evidence.secretOrPersonalDataExposed = true;
  const result = validateRetentionEvidence(evidence, policy);
  assert.ok(
    result.findings.includes(
      'deletedDataReintroducedAfterRestore-must-be-false',
    ),
  );
  assert.ok(
    result.findings.includes('secretOrPersonalDataExposed-must-be-false'),
  );
});

test('requires policy safeguards', () => {
  const invalidPolicy = structuredClone(policy);
  invalidPolicy.globalRules.legalHoldOverridesDeletion = false;
  invalidPolicy.globalRules.backupExpiryMustNotReintroduceDeletedData = false;
  invalidPolicy.globalRules.deletionEvidenceRequired = false;
  const result = validateRetentionEvidence(validEvidence(), invalidPolicy);
  assert.ok(result.findings.includes('policy-legal-hold-override-required'));
  assert.ok(
    result.findings.includes('policy-backup-reintroduction-guard-required'),
  );
  assert.ok(result.findings.includes('policy-deletion-evidence-required'));
});

test('requires follow-up reference when follow-up is required', () => {
  const evidence = validEvidence();
  evidence.followUpRequired = true;
  evidence.followUpReferencePresent = false;
  const result = validateRetentionEvidence(evidence, policy);
  assert.ok(result.findings.includes('follow-up-reference-required'));
});

test('rejects invalid timestamp, unknown field, and sensitive value', () => {
  const evidence = validEvidence();
  evidence.completedAt = 'invalid';
  evidence.notes = 'postgresql://example.invalid';
  evidence.projectRef = 'must-not-be-recorded';
  const result = validateRetentionEvidence(evidence, policy);
  assert.ok(result.findings.includes('invalid-timestamp:completedAt'));
  assert.ok(result.findings.includes('sensitive-retention-value:notes'));
  assert.ok(result.findings.includes('unknown-field:projectRef'));
});
