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

function hasRule(result, rule) {
  return result.findings.some((finding) => finding.rule === rule);
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
  assert.equal(hasRule(result, 'required-field-missing'), true);
  assert.equal(hasRule(result, 'invalid-environment'), true);
});

test('rejects duplicate secret ids and direct storage urls', () => {
  const secondRow = validRow({
    storage: 'https://example.invalid/secret',
  });
  const result = validateSecretInventory({
    secrets: [validRow(), secondRow],
  });

  assert.equal(hasRule(result, 'duplicate-secret-id'), true);
  assert.equal(hasRule(result, 'direct-url-not-allowed'), true);
});

test('detects secret-like values without returning the matched value', () => {
  const row = validRow({ purpose: 'sb_secret_do_not_log_12345' });
  const result = validateSecretInventory({ secrets: [row] });

  assert.equal(hasRule(result, 'supabase-secret-value'), true);
  assert.equal(JSON.stringify(result).includes('do_not_log'), false);
});

test('requires a non-empty secrets array', () => {
  const missing = validateSecretInventory({});
  const empty = validateSecretInventory({ secrets: [] });

  assert.equal(missing.status, 'SECRET_INVENTORY_FAILED');
  assert.equal(hasRule(empty, 'inventory-empty'), true);
});
