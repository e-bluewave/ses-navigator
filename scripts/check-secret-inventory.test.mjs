import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSecretInventory } from './check-secret-inventory.mjs';

function validRow(overrides = {}) {
  return {
    secretId: 'supabase-server-staging',
    provider: 'Supabase',
    purpose: 'Server-side Data API administration',
    environment: 'Staging',
    storage: 'Supabase project secrets',
    owner: 'Service owner',
    components: ['API'],
    issuedAt: '2026-08-24',
    updatedAt: '2026-08-24',
    status: 'active',
    nextReviewAt: '2026-09-24',
    revocationCondition: 'suspected exposure or purpose ended',
    ...overrides,
  };
}

test('accepts metadata-only inventory', () => {
  const result = validateSecretInventory({ secrets: [validRow()] });
  assert.equal(result.status, 'SECRET_INVENTORY_PASSED');
  assert.equal(result.rowCount, 1);
  assert.deepEqual(result.findings, []);
});

test('rejects missing required metadata and invalid environment', () => {
  const row = validRow({ owner: '', environment: 'prod' });
  const result = validateSecretInventory({ secrets: [row] });
  assert.equal(result.status, 'SECRET_INVENTORY_FAILED');
  assert.ok(result.findings.some((finding) => finding.rule === 'required-field-missing'));
  assert.ok(result.findings.some((finding) => finding.rule === 'invalid-environment'));
});

test('rejects duplicate secret ids and direct storage urls', () => {
  const result = validateSecretInventory({
    secrets: [validRow(), validRow({ storage: 'https://example.invalid/secret' })],
  });
  assert.ok(result.findings.some((finding) => finding.rule === 'duplicate-secret-id'));
  assert.ok(result.findings.some((finding) => finding.rule === 'direct-url-not-allowed'));
});

test('detects secret-like values without returning the matched value', () => {
  const result = validateSecretInventory({
    secrets: [validRow({ purpose: 'sb_secret_do_not_log_12345' })],
  });
  assert.ok(result.findings.some((finding) => finding.rule === 'supabase-secret-value'));
  assert.equal(JSON.stringify(result).includes('do_not_log'), false);
});

test('requires a non-empty secrets array', () => {
  assert.equal(validateSecretInventory({}).status, 'SECRET_INVENTORY_FAILED');
  assert.ok(
    validateSecretInventory({ secrets: [] }).findings.some(
      (finding) => finding.rule === 'inventory-empty',
    ),
  );
});
