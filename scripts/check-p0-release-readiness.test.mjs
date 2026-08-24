import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateP0ReleaseReadiness } from './check-p0-release-readiness.mjs';

const ids = Array.from(
  { length: 20 },
  (_, index) => `BA-${String(index + 1).padStart(3, '0')}`,
);

function makePolicy(statusFor = () => 'pending') {
  const items = ids.map((id) => ({
    id,
    status: statusFor(id),
    evidence: `${id} evidence`,
  }));
  const productionReady = items.every((item) => item.status === 'verified');
  return {
    version: 1,
    scope: 'p0-release-readiness',
    productionReady,
    requireAllP0Verified: true,
    items,
  };
}

test('accepts a structurally valid not-ready policy', () => {
  const policy = makePolicy((id) =>
    ['BA-004', 'BA-018', 'BA-020'].includes(id) ? 'verified' : 'pending',
  );
  const result = evaluateP0ReleaseReadiness(policy);
  assert.equal(result.status, 'P0_RELEASE_READINESS_POLICY_PASSED');
  assert.equal(result.productionReady, false);
  assert.deepEqual(result.verified, ['BA-004', 'BA-018', 'BA-020']);
  assert.equal(result.failures.length, 0);
});

test('becomes ready only when all P0 items are verified', () => {
  const result = evaluateP0ReleaseReadiness(makePolicy(() => 'verified'));
  assert.equal(result.productionReady, true);
  assert.equal(result.pending.length, 0);
  assert.equal(result.deferred.length, 0);
  assert.equal(result.failures.length, 0);
});

test('rejects missing and unexpected P0 items', () => {
  const policy = makePolicy();
  policy.items = policy.items.filter((item) => item.id !== 'BA-010');
  policy.items.push({
    id: 'BA-999',
    status: 'pending',
    evidence: 'unexpected',
  });
  const result = evaluateP0ReleaseReadiness(policy);
  assert.ok(result.failures.includes('missing P0 item: BA-010'));
  assert.ok(result.failures.includes('unexpected P0 item: BA-999'));
});

test('rejects declared readiness that does not match computed readiness', () => {
  const policy = makePolicy();
  policy.productionReady = true;
  const result = evaluateP0ReleaseReadiness(policy);
  assert.ok(
    result.failures.includes(
      'declared productionReady must match computed readiness',
    ),
  );
});

test('rejects invalid status or missing evidence', () => {
  const policy = makePolicy();
  policy.items[0] = { id: 'BA-001', status: 'done', evidence: '' };
  const result = evaluateP0ReleaseReadiness(policy);
  assert.ok(result.failures.includes('invalid status for BA-001'));
  assert.ok(result.failures.includes('evidence is required for BA-001'));
});
