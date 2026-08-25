import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePersonalDataErasureEvidence } from './check-personal-data-erasure-evidence.mjs';

const policy = {
  allowedDispositionModes: ['hard-delete', 'irreversible-anonymization'],
  anonymization: {
    mustBeIrreversible: true,
    reidentificationKeyAllowed: false,
  },
  legalHold: {
    overridesDeletion: true,
  },
  execution: {
    backupTombstoneLedgerRequired: true,
    restoreReapplyDeletionRequired: true,
  },
};

function validEvidence() {
  return {
    evidenceId: 'BA011-ERASURE-20260825-01',
    environment: 'Staging',
    completedAt: '2026-08-25T15:30:00+09:00',
    dryRunInventoryCompleted: true,
    databaseDeletionCompleted: true,
    storageDeletionCompleted: true,
    derivedDataDeletionCompleted: true,
    irreversibleAnonymizationVerified: true,
    reidentificationKeyPresent: false,
    legalHoldRespected: true,
    tenantOffboardingAccessRevoked: true,
    newWritesBlocked: true,
    integrationCredentialsRevoked: true,
    webhooksAndTokensRevoked: true,
    backupTombstoneLedgerUpdated: true,
    restoreReapplyDeletionVerified: true,
    productionIdentifiersRecorded: false,
    personalDataRecorded: false,
    secretOrPersonalDataExposed: false,
    secretFreeEvidence: true,
    dispositionMode: 'hard-delete',
    followUpRequired: false,
    notes: 'Secret-free personal data erasure evidence.',
  };
}

test('accepts complete BA-011 erasure evidence', () => {
  const result = validatePersonalDataErasureEvidence(validEvidence(), policy);
  assert.equal(result.status, 'PERSONAL_DATA_ERASURE_EVIDENCE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
});

test('rejects incomplete deletion surfaces', () => {
  const evidence = validEvidence();
  evidence.databaseDeletionCompleted = false;
  evidence.storageDeletionCompleted = false;
  evidence.derivedDataDeletionCompleted = false;
  const result = validatePersonalDataErasureEvidence(evidence, policy);
  assert.ok(result.findings.includes('databaseDeletionCompleted-must-be-true'));
  assert.ok(result.findings.includes('storageDeletionCompleted-must-be-true'));
  assert.ok(result.findings.includes('derivedDataDeletionCompleted-must-be-true'));
});

test('rejects reidentification key and policy-incompatible disposition', () => {
  const evidence = validEvidence();
  evidence.reidentificationKeyPresent = true;
  evidence.dispositionMode = 'soft-delete-only';
  const result = validatePersonalDataErasureEvidence(evidence, policy);
  assert.ok(result.findings.includes('reidentificationKeyPresent-must-be-false'));
  assert.ok(result.findings.includes('disposition-mode-not-allowed'));
});

test('requires Legal Hold, tombstone, and restore safeguards in policy', () => {
  const invalidPolicy = structuredClone(policy);
  invalidPolicy.legalHold.overridesDeletion = false;
  invalidPolicy.execution.backupTombstoneLedgerRequired = false;
  invalidPolicy.execution.restoreReapplyDeletionRequired = false;
  const result = validatePersonalDataErasureEvidence(validEvidence(), invalidPolicy);
  assert.ok(result.findings.includes('policy-legal-hold-override-required'));
  assert.ok(result.findings.includes('policy-backup-tombstone-ledger-required'));
  assert.ok(result.findings.includes('policy-restore-reapply-deletion-required'));
});

test('requires follow-up reference when follow-up is required', () => {
  const evidence = validEvidence();
  evidence.followUpRequired = true;
  evidence.followUpReferencePresent = false;
  const result = validatePersonalDataErasureEvidence(evidence, policy);
  assert.ok(result.findings.includes('follow-up-reference-required'));
});

test('rejects sensitive values, Production identifiers, and personal data', () => {
  const evidence = validEvidence();
  evidence.productionIdentifiersRecorded = true;
  evidence.personalDataRecorded = true;
  evidence.notes = 'postgresql://example.invalid';
  const result = validatePersonalDataErasureEvidence(evidence, policy);
  assert.ok(result.findings.includes('productionIdentifiersRecorded-must-be-false'));
  assert.ok(result.findings.includes('personalDataRecorded-must-be-false'));
  assert.ok(result.findings.includes('sensitive-erasure-value:notes'));
});
