import assert from 'node:assert/strict';
import test from 'node:test';

import { validateSecretRotationDrillEvidence } from './check-secret-rotation-drill-evidence.mjs';

function validEvidence() {
  return {
    drillId: 'BA005-DRILL-20260824-01',
    secretId: 'staging-api-credential',
    environment: 'Staging',
    provider: 'example-provider',
    startedAt: '2026-08-24T10:00:00+09:00',
    completedAt: '2026-08-24T10:20:00+09:00',
    inventoryValidation: 'PASS',
    newCredentialDeployed: true,
    smokeTest: 'PASS',
    oldCredentialRevoked: true,
    oldCredentialRejected: 'yes',
    newCredentialVerified: true,
    productionTouched: false,
    secretFreeEvidence: true,
    rollbackUsed: false,
    monitoringResult: 'PASS',
    notes: 'No secret values recorded.',
  };
}

test('accepts complete non-production secret-free evidence', () => {
  const result = validateSecretRotationDrillEvidence(validEvidence());
  assert.equal(result.status, 'SECRET_ROTATION_DRILL_EVIDENCE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
});

test('allows provider not-testable old credential rejection only with reason', () => {
  const evidence = validEvidence();
  evidence.oldCredentialRejected = 'not-testable';
  evidence.oldCredentialRejectionReason =
    'Provider revokes immediately without a reusable verification path.';
  const result = validateSecretRotationDrillEvidence(evidence);
  assert.equal(result.complete, true);
});

test('rejects Production or a drill that touched Production', () => {
  const evidence = validEvidence();
  evidence.environment = 'Production';
  evidence.productionTouched = true;
  const result = validateSecretRotationDrillEvidence(evidence);
  assert.ok(result.findings.includes('environment-must-be-non-production'));
  assert.ok(result.findings.includes('production-must-not-be-touched'));
});

test('rejects incomplete rotation outcomes', () => {
  const evidence = validEvidence();
  evidence.inventoryValidation = 'FAIL';
  evidence.smokeTest = 'FAIL';
  evidence.oldCredentialRevoked = false;
  evidence.oldCredentialRejected = 'no';
  evidence.newCredentialVerified = false;
  const result = validateSecretRotationDrillEvidence(evidence);
  assert.ok(result.findings.includes('inventory-validation-must-pass'));
  assert.ok(result.findings.includes('smoke-test-must-pass'));
  assert.ok(result.findings.includes('old-credential-must-be-revoked'));
  assert.ok(
    result.findings.includes(
      'old-credential-rejection-must-be-confirmed-or-not-testable',
    ),
  );
  assert.ok(result.findings.includes('new-credential-must-be-verified'));
});

test('rejects not-testable without a reason', () => {
  const evidence = validEvidence();
  evidence.oldCredentialRejected = 'not-testable';
  const result = validateSecretRotationDrillEvidence(evidence);
  assert.ok(
    result.findings.includes('old-credential-not-testable-reason-required'),
  );
});

test('rejects secret-like values, email addresses, and unknown fields', () => {
  const evidence = validEvidence();
  evidence.notes = 'contact user@example.test';
  evidence.token = 'sb_secret_example_value';
  const result = validateSecretRotationDrillEvidence(evidence);
  assert.ok(result.findings.includes('unknown-field:token'));
  assert.ok(result.findings.includes('secret-like-value:notes'));
  assert.ok(result.findings.includes('secret-like-value:token'));
});

test('rejects invalid timestamps and missing required fields', () => {
  const evidence = validEvidence();
  evidence.startedAt = 'not-a-date';
  delete evidence.provider;
  const result = validateSecretRotationDrillEvidence(evidence);
  assert.ok(result.findings.includes('invalid-timestamp:startedAt'));
  assert.ok(result.findings.includes('required-field-missing:provider'));
});
