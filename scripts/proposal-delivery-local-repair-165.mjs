import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { isMainModule } from './cli-entry.mjs';
import { runProposalDeliveryLocalPreflight } from './proposal-delivery-local-preflight.mjs';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const DB_CONTAINER = 'supabase_db_ses-navigator';

const FUNCTION_MARKERS = [
  'public.prepare_proposal_message_delivery(',
  'public.prepare_proposal_message_retry(',
];

export function buildProposalDeliveryMigration165RepairSql(migrationSql) {
  if (typeof migrationSql !== 'string' || migrationSql.length === 0) {
    throw new Error('Migration 165 SQL is empty');
  }
  if (migrationSql.includes('public.digest(')) {
    throw new Error('Migration 165 still contains public.digest');
  }
  const digestCount = (migrationSql.match(/extensions\.digest\(/gu) ?? []).length;
  if (digestCount < 2) {
    throw new Error('Migration 165 does not contain both qualified digest calls');
  }

  const functions = FUNCTION_MARKERS.map((marker) =>
    extractFunctionDefinition(migrationSql, marker),
  );

  return ['begin;', ...functions, 'commit;', ''].join('\n\n');
}

export async function runProposalDeliveryMigration165Repair({
  repoRoot = REPO_ROOT,
  runCommand = defaultRunCommand,
  log = console.log,
} = {}) {
  await runProposalDeliveryLocalPreflight({
    repoRoot,
    runCommand,
    log,
  });

  const migrationSql = await readFile(
    new URL('../supabase/migrations/165_proposal_message_delivery_rpc.sql', import.meta.url),
    'utf8',
  );
  const repairSql = buildProposalDeliveryMigration165RepairSql(migrationSql);

  const before = runCommand(
    'docker',
    [
      'exec',
      '-i',
      DB_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-A',
      '-t',
      '-q',
      '-c',
      functionDefinitionProbeSql(),
    ],
    { cwd: repoRoot },
  ).trim();

  if (before.includes('extensions.digest')) {
    log('NORMAL LOCAL Migration 165 delivery RPCs are already repaired');
    return { repaired: false, alreadyRepaired: true };
  }
  if (!before.includes('public.digest')) {
    throw new Error(
      'Migration 165 delivery RPC definitions are not in the expected pre-repair state',
    );
  }

  log('Repairing Migration 165 delivery RPC definitions on NORMAL LOCAL only');
  runCommand(
    'docker',
    [
      'exec',
      '-i',
      DB_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
    ],
    { cwd: repoRoot, input: repairSql },
  );

  const after = runCommand(
    'docker',
    [
      'exec',
      '-i',
      DB_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-A',
      '-t',
      '-q',
      '-c',
      functionDefinitionProbeSql(),
    ],
    { cwd: repoRoot },
  ).trim();

  if (
    after.includes('public.digest') ||
    (after.match(/extensions\.digest/gu) ?? []).length < 2
  ) {
    throw new Error('Migration 165 NORMAL LOCAL repair verification failed');
  }

  log('NORMAL LOCAL Migration 165 delivery RPC repair passed');
  return { repaired: true, alreadyRepaired: false };
}

function extractFunctionDefinition(sql, marker) {
  const startToken = `create or replace function ${marker}`;
  const start = sql.indexOf(startToken);
  if (start < 0) {
    throw new Error(`Missing function definition: ${marker}`);
  }
  const end = sql.indexOf('\n$$;', start);
  if (end < 0) {
    throw new Error(`Unterminated function definition: ${marker}`);
  }
  return sql.slice(start, end + '\n$$;'.length);
}

function functionDefinitionProbeSql() {
  return [
    "select pg_get_functiondef('public.prepare_proposal_message_delivery(uuid,uuid,text,text)'::regprocedure);",
    "select pg_get_functiondef('public.prepare_proposal_message_retry(uuid,uuid,text,text)'::regprocedure);",
  ].join(' ');
}

function defaultRunCommand(command, args, { cwd, input } = {}) {
  const executable =
    process.platform === 'win32' && command === 'supabase'
      ? 'supabase.exe'
      : command;
  const outcome = spawnSync(executable, args, {
    cwd,
    env: process.env,
    encoding: 'utf8',
    shell: false,
    input,
  });
  if (outcome.error) {
    throw new Error(`${command} command could not start`);
  }
  if (outcome.status !== 0) {
    throw new Error(
      `${command} command failed: ${(outcome.stderr || outcome.stdout || '').trim()}`,
    );
  }
  return outcome.stdout ?? '';
}

if (isMainModule(import.meta.url)) {
  runProposalDeliveryMigration165Repair()
    .then(() => {
      console.log('NORMAL LOCAL proposal delivery Migration 165 repair complete');
    })
    .catch((error) => {
      console.error(
        error instanceof Error
          ? error.message
          : 'Proposal delivery Migration 165 repair failed',
      );
      process.exitCode = 1;
    });
}
