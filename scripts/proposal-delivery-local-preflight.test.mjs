import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runProposalDeliveryLocalPreflight,
  validateProposalDeliveryLocalTarget,
} from './proposal-delivery-local-preflight.mjs';

const configText = `
project_id = "ses-navigator"

[api]
port = 54321

[db]
port = 54322
`;

const status = {
  API_URL: 'http://127.0.0.1:54321',
  DB_URL: 'postgresql://postgres:local-only@127.0.0.1:54322/postgres',
};

test('accepts only the normal SES Navigator local target', () => {
  const result = validateProposalDeliveryLocalTarget({
    configText,
    status,
    containerNames: [
      'supabase_db_ses-navigator',
      'supabase_db_sesn-ba008-restore-drill',
    ],
  });

  assert.equal(result.status, 'PROPOSAL_DELIVERY_LOCAL_PREFLIGHT_PASSED');
  assert.equal(result.complete, true);
  assert.equal(result.target.dbPort, '54322');
  assert.equal(result.target.restoreDrillTouched, false);
  assert.equal(result.target.remoteDatabaseTouched, false);
});

test('rejects restore-drill or other database ports as the local target', () => {
  const result = validateProposalDeliveryLocalTarget({
    configText,
    status: {
      ...status,
      DB_URL: 'postgresql://postgres:local-only@127.0.0.1:55322/postgres',
    },
    containerNames: ['supabase_db_sesn-ba008-restore-drill'],
  });

  assert.equal(result.complete, false);
  assert.ok(result.findings.includes('unexpected-local-db-url'));
  assert.ok(
    result.findings.includes('expected-local-db-container-not-running'),
  );
});

test('rejects unexpected project or API configuration', () => {
  const result = validateProposalDeliveryLocalTarget({
    configText: configText
      .replace('ses-navigator', 'different-project')
      .replace('54321', '64321'),
    status,
    containerNames: ['supabase_db_ses-navigator'],
  });

  assert.equal(result.complete, false);
  assert.ok(result.findings.includes('unexpected-project-id'));
  assert.ok(result.findings.includes('unexpected-api-port'));
});

test('applies migrations only after the target preflight passes', async () => {
  const calls = [];
  const runCommand = (command, args) => {
    calls.push([command, ...args]);
    if (command === 'supabase' && args[0] === 'status') {
      return JSON.stringify(status);
    }
    if (command === 'docker') {
      return [
        'supabase_db_ses-navigator',
        'supabase_db_sesn-ba008-restore-drill',
      ].join('\n');
    }
    if (
      command === 'supabase' &&
      args[0] === 'migration' &&
      args[1] === 'up'
    ) {
      return 'Local database is up to date.';
    }
    throw new Error('unexpected command');
  };

  const result = await runProposalDeliveryLocalPreflight({
    applyMigration165: true,
    runCommand,
    log: () => undefined,
  });

  assert.equal(result.migrationCommandExecuted, true);
  assert.deepEqual(calls.at(-1), [
    'supabase',
    'migration',
    'up',
    '--local',
  ]);
});

test('never applies a migration when target validation fails', async () => {
  const calls = [];
  const runCommand = (command, args) => {
    calls.push([command, ...args]);
    if (command === 'supabase') {
      return JSON.stringify({
        ...status,
        DB_URL: 'postgresql://postgres:secret@example.invalid:5432/postgres',
      });
    }
    if (command === 'docker') return 'supabase_db_ses-navigator';
    throw new Error('migration command must not run');
  };

  await assert.rejects(
    runProposalDeliveryLocalPreflight({
      applyMigration165: true,
      runCommand,
      log: () => undefined,
    }),
    /preflight failed/u,
  );

  assert.equal(
    calls.some(
      ([command, action]) => command === 'supabase' && action === 'migration',
    ),
    false,
  );
});
