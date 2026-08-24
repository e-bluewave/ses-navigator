import assert from 'node:assert/strict';
import test from 'node:test';

import { validateEnvironmentSeparationEvidence } from './check-environment-separation-evidence.mjs';

function validEvidence() {
  return {
    evidenceId: 'BA001-ENV-20260824-01',
    verifiedAt: '2026-08-24T19:00:00+09:00',
    stagingSupabaseDistinct: true,
    productionSupabaseDistinct: true,
    stagingVercelDistinct: true,
    productionVercelDistinct: true,
    stagingAndProductionSupabaseDifferent: true,
    stagingAndProductionVercelDifferent: true,
    secretsSeparated: true,
    productionDataUsedOutsideProduction: false,
    runtimeBindingCheck: 'PASS',
    stagingCommitMatchesMain: true,
    stagingSmokeTest: 'PASS',
    secretFreeEvidence: true,
    migrationParity: 'PASS',
    notes: 'Environment identifiers are stored outside the repository.',
  };
}

test('accepts complete secret-free separation evidence', () => {
  const result = validateEnvironmentSeparationEvidence(validEvidence());
  assert.equal(result.status, 'ENVIRONMENT_SEPARATION_EVIDENCE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
});

test('rejects shared bindings and secrets', () => {
  const evidence = validEvidence();
  evidence.stagingAndProductionSupabaseDifferent = false;
  evidence.stagingAndProductionVercelDifferent = false;
  evidence.secretsSeparated = false;
  const result = validateEnvironmentSeparationEvidence(evidence);
  assert.ok(
    result.findings.includes('stagingAndProductionSupabaseDifferent-must-be-true'),
  );
  assert.ok(
    result.findings.includes('stagingAndProductionVercelDifferent-must-be-true'),
  );
  assert.ok(result.findings.includes('secretsSeparated-must-be-true'));
});

test('rejects Production data use outside Production', () => {
  const evidence = validEvidence();
  evidence.productionDataUsedOutsideProduction = true;
  const result = validateEnvironmentSeparationEvidence(evidence);
  assert.ok(
    result.findings.includes('production-data-must-not-be-used-outside-production'),
  );
});

test('requires runtime binding and Staging smoke PASS', () => {
  const evidence = validEvidence();
  evidence.runtimeBindingCheck = 'FAIL';
  evidence.stagingSmokeTest = 'FAIL';
  const result = validateEnvironmentSeparationEvidence(evidence);
  assert.ok(result.findings.includes('runtime-binding-check-must-pass'));
  assert.ok(result.findings.includes('staging-smoke-test-must-pass'));
});

test('rejects sensitive environment values and unknown fields', () => {
  const evidence = validEvidence();
  evidence.notes = 'https://example-project.supabase.co';
  evidence.projectRef = 'should-not-be-stored';
  const result = validateEnvironmentSeparationEvidence(evidence);
  assert.ok(result.findings.includes('sensitive-environment-value:notes'));
  assert.ok(result.findings.includes('unknown-field:projectRef'));
});

test('rejects invalid timestamp and missing required fields', () => {
  const evidence = validEvidence();
  evidence.verifiedAt = 'invalid';
  delete evidence.evidenceId;
  const result = validateEnvironmentSeparationEvidence(evidence);
  assert.ok(result.findings.includes('invalid-timestamp:verifiedAt'));
  assert.ok(result.findings.includes('required-field-missing:evidenceId'));
});
