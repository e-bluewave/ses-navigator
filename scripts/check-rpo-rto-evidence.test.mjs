import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRpoRtoEvidence } from './check-rpo-rto-evidence.mjs';

const policy = {
  tiers: {
    tier1: { rpoMinutes: 60, rtoMinutes: 240 },
    tier2: { rpoMinutes: 240, rtoMinutes: 480 },
    tier3: { rpoMinutes: 1440, rtoMinutes: 1440 },
  },
};

function validEvidence() {
  return {
    evidenceId: 'BA009-RPO-RTO-20260825-01',
    environment: 'Staging',
    completedAt: '2026-08-25T10:00:00+09:00',
    restoreDrillEvidencePassed: true,
    measurementsTakenFromBa008: true,
    tier1RpoMinutesMeasured: 30,
    tier1RtoMinutesMeasured: 180,
    tier2RpoMinutesMeasured: 120,
    tier2RtoMinutesMeasured: 360,
    tier3RpoMinutesMeasured: 720,
    tier3RtoMinutesMeasured: 900,
    businessOwnerApproved: true,
    technicalOwnerApproved: true,
    targetsAcknowledged: true,
    annualReviewScheduled: true,
    exceptionUsed: false,
    secretOrPersonalDataExposed: false,
    secretFreeEvidence: true,
    notes: 'Secret-free RPO/RTO measurement evidence.',
  };
}

test('accepts measurements within all RPO/RTO targets', () => {
  const result = validateRpoRtoEvidence(validEvidence(), policy);
  assert.equal(result.status, 'RPO_RTO_EVIDENCE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
});

test('rejects measurements exceeding RPO and RTO targets', () => {
  const evidence = validEvidence();
  evidence.tier1RpoMinutesMeasured = 61;
  evidence.tier2RtoMinutesMeasured = 481;
  const result = validateRpoRtoEvidence(evidence, policy);
  assert.ok(result.findings.includes('tier1-rpo-target-exceeded'));
  assert.ok(result.findings.includes('tier2-rto-target-exceeded'));
});

test('requires owner approvals and BA-008 measurement source', () => {
  const evidence = validEvidence();
  evidence.businessOwnerApproved = false;
  evidence.technicalOwnerApproved = false;
  evidence.measurementsTakenFromBa008 = false;
  const result = validateRpoRtoEvidence(evidence, policy);
  assert.ok(result.findings.includes('businessOwnerApproved-must-be-true'));
  assert.ok(result.findings.includes('technicalOwnerApproved-must-be-true'));
  assert.ok(result.findings.includes('measurementsTakenFromBa008-must-be-true'));
});

test('requires approval and expiry metadata for exceptions', () => {
  const evidence = validEvidence();
  evidence.exceptionUsed = true;
  evidence.exceptionApprovalPresent = false;
  evidence.exceptionExpiryPresent = false;
  const result = validateRpoRtoEvidence(evidence, policy);
  assert.ok(result.findings.includes('exception-approval-required'));
  assert.ok(result.findings.includes('exception-expiry-required'));
});

test('rejects invalid measurements and invalid policy targets', () => {
  const evidence = validEvidence();
  evidence.tier3RtoMinutesMeasured = -1;
  const invalidPolicy = structuredClone(policy);
  invalidPolicy.tiers.tier2.rpoMinutes = 0;
  const result = validateRpoRtoEvidence(evidence, invalidPolicy);
  assert.ok(result.findings.includes('invalid-policy-target:tier2'));
  assert.ok(result.findings.includes('tier3RtoMinutesMeasured-must-be-non-negative-number'));
});

test('rejects unknown fields, invalid timestamps, and sensitive values', () => {
  const evidence = validEvidence();
  evidence.completedAt = 'invalid';
  evidence.notes = 'postgresql://example.invalid';
  evidence.projectRef = 'must-not-be-recorded';
  const result = validateRpoRtoEvidence(evidence, policy);
  assert.ok(result.findings.includes('invalid-timestamp:completedAt'));
  assert.ok(result.findings.includes('sensitive-rpo-rto-value:notes'));
  assert.ok(result.findings.includes('unknown-field:projectRef'));
});
