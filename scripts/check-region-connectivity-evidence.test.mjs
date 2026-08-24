import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRegionConnectivityEvidence } from './check-region-connectivity-evidence.mjs';

function validEvidence() {
  return {
    evidenceId: 'BA002-REGION-20260825-01',
    verifiedAt: '2026-08-25T07:00:00+09:00',
    stagingRegionConfirmed: true,
    productionRegionConfirmed: true,
    regionAlignment: 'PASS',
    stagingDatabaseMode: 'data-api',
    productionDatabaseMode: 'data-api',
    migrationConnectionMode: 'direct',
    backupRestoreConnectionMode: 'session-pooler',
    runtimeBindingCheck: 'PASS',
    stagingSmokeTest: 'PASS',
    latencyMeasured: true,
    latencyP50Ms: 120,
    latencyP95Ms: 300,
    latencyP99Ms: 500,
    errorRatePercent: 0.2,
    crossRegionProductionException: 'none',
    secretFreeEvidence: true,
    sampleCount: 100,
    notes: 'Measured in Staging without environment identifiers.',
  };
}

test('accepts complete BA-002 evidence', () => {
  const result = validateRegionConnectivityEvidence(validEvidence());
  assert.equal(result.status, 'REGION_CONNECTIVITY_EVIDENCE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
});

test('rejects unmatched runtime modes and invalid admin paths', () => {
  const evidence = validEvidence();
  evidence.productionDatabaseMode = 'transaction-pooler';
  evidence.migrationConnectionMode = 'transaction-pooler';
  evidence.backupRestoreConnectionMode = 'transaction-pooler';
  const result = validateRegionConnectivityEvidence(evidence);
  assert.ok(
    result.findings.includes('staging-production-database-mode-must-match'),
  );
  assert.ok(
    result.findings.includes('migration-mode-must-be-direct-or-session-pooler'),
  );
  assert.ok(
    result.findings.includes(
      'backup-restore-mode-must-be-direct-or-session-pooler',
    ),
  );
});

test('rejects missing region and smoke validation', () => {
  const evidence = validEvidence();
  evidence.stagingRegionConfirmed = false;
  evidence.regionAlignment = 'FAIL';
  evidence.runtimeBindingCheck = 'FAIL';
  evidence.stagingSmokeTest = 'FAIL';
  const result = validateRegionConnectivityEvidence(evidence);
  assert.ok(result.findings.includes('stagingRegionConfirmed-must-be-true'));
  assert.ok(result.findings.includes('region-alignment-must-pass'));
  assert.ok(result.findings.includes('runtime-binding-check-must-pass'));
  assert.ok(result.findings.includes('staging-smoke-test-must-pass'));
});

test('rejects invalid latency metrics', () => {
  const evidence = validEvidence();
  evidence.latencyP50Ms = 400;
  evidence.latencyP95Ms = 300;
  evidence.latencyP99Ms = -1;
  evidence.errorRatePercent = 101;
  const result = validateRegionConnectivityEvidence(evidence);
  assert.ok(result.findings.includes('latency-p50-must-not-exceed-p95'));
  assert.ok(
    result.findings.includes('latencyP99Ms-must-be-non-negative-number'),
  );
  assert.ok(result.findings.includes('error-rate-percent-must-not-exceed-100'));
});

test('rejects sensitive environment values and unknown fields', () => {
  const evidence = validEvidence();
  evidence.notes = 'postgresql://example.invalid';
  evidence.projectRef = 'must-not-be-recorded';
  const result = validateRegionConnectivityEvidence(evidence);
  assert.ok(result.findings.includes('sensitive-environment-value:notes'));
  assert.ok(result.findings.includes('unknown-field:projectRef'));
});

test('rejects invalid timestamp and missing field', () => {
  const evidence = validEvidence();
  evidence.verifiedAt = 'invalid';
  delete evidence.evidenceId;
  const result = validateRegionConnectivityEvidence(evidence);
  assert.ok(result.findings.includes('invalid-timestamp:verifiedAt'));
  assert.ok(result.findings.includes('required-field-missing:evidenceId'));
});
