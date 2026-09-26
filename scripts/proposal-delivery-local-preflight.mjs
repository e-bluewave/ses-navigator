import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { isMainModule } from './cli-entry.mjs';
import { prepareSpawnSyncInvocation } from './windows-cmd-spawn.mjs';

const EXPECTED = {
  projectId: 'ses-navigator',
  apiUrl: 'http://127.0.0.1:54321',
  dbHost: '127.0.0.1',
  dbPort: '54322',
  dbContainer: 'supabase_db_ses-navigator',
};

export function validateProposalDeliveryLocalTarget({
  configText,
  status,
  containerNames,
} = {}) {
  const findings = [];
  const projectId = readTomlString(configText, 'project_id');
  const apiPort = readTomlNumberInSection(configText, 'api', 'port');
  const dbPort = readTomlNumberInSection(configText, 'db', 'port');

  if (projectId !== EXPECTED.projectId) {
    findings.push('unexpected-project-id');
  }
  if (apiPort !== 54321) {
    findings.push('unexpected-api-port');
  }
  if (dbPort !== 54322) {
    findings.push('unexpected-db-port');
  }

  const apiUrl = firstString(status, ['API_URL', 'api_url']);
  if (normalizeUrl(apiUrl) !== EXPECTED.apiUrl) {
    findings.push('unexpected-local-api-url');
  }

  const dbUrl = firstString(status, ['DB_URL', 'db_url']);
  if (!isExpectedLocalDbUrl(dbUrl)) {
    findings.push('unexpected-local-db-url');
  }

  const names = Array.isArray(containerNames) ? containerNames : [];
  if (!names.includes(EXPECTED.dbContainer)) {
    findings.push('expected-local-db-container-not-running');
  }

  return {
    status:
      findings.length === 0
        ? 'PROPOSAL_DELIVERY_LOCAL_PREFLIGHT_PASSED'
        : 'PROPOSAL_DELIVERY_LOCAL_PREFLIGHT_FAILED',
    complete: findings.length === 0,
    findings,
    target: {
      projectId: EXPECTED.projectId,
      apiUrl: EXPECTED.apiUrl,
      dbHost: EXPECTED.dbHost,
      dbPort: EXPECTED.dbPort,
      dbContainer: EXPECTED.dbContainer,
      restoreDrillTouched: false,
      remoteDatabaseTouched: false,
    },
  };
}

export async function runProposalDeliveryLocalPreflight({
  repoRoot = '.',
  applyMigration165 = false,
  runCommand = defaultRunCommand,
  log = console.log,
} = {}) {
  const configText = await readFile(
    new URL('../supabase/config.toml', import.meta.url),
    'utf8',
  );

  const statusText = runCommand('supabase', ['status', '-o', 'json'], {
    cwd: repoRoot,
  });
  const status = parseJsonObject(statusText, 'supabase status');
  const dockerText = runCommand('docker', ['ps', '--format', '{{.Names}}'], {
    cwd: repoRoot,
  });
  const containerNames = dockerText
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);

  const result = validateProposalDeliveryLocalTarget({
    configText,
    status,
    containerNames,
  });
  log(JSON.stringify(result, null, 2));

  if (!result.complete) {
    throw new Error(
      'Proposal delivery local preflight failed (' +
        result.findings.length +
        ')',
    );
  }

  if (applyMigration165) {
    log('Applying pending migrations to the verified NORMAL LOCAL target only');
    runCommand('supabase', ['migration', 'up', '--local'], { cwd: repoRoot });
    log('Local migration command completed');
  }

  return {
    ...result,
    migrationCommandExecuted: applyMigration165,
  };
}

function defaultRunCommand(command, args, { cwd } = {}) {
  const invocation = prepareSpawnSyncInvocation({
    command,
    args,
    platform: process.platform,
    env: process.env,
  });
  const outcome = spawnSync(invocation.command, invocation.args, {
    cwd,
    env: invocation.env,
    encoding: 'utf8',
    shell: false,
  });

  if (outcome.error) {
    throw new Error(command + ' command could not start');
  }
  if (outcome.status !== 0) {
    throw new Error(command + ' command failed');
  }
  return outcome.stdout ?? '';
}

function parseJsonObject(text, sourceName) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error(sourceName + ' did not return JSON');
  }
  const value = JSON.parse(text.slice(start, end + 1));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(sourceName + ' did not return an object');
  }
  return value;
}

function firstString(object, keys) {
  for (const key of keys) {
    if (typeof object?.[key] === 'string') return object[key];
  }
  return '';
}

function normalizeUrl(value) {
  return typeof value === 'string' ? value.replace(/\/+$/u, '') : '';
}

function isExpectedLocalDbUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'postgresql:' &&
      url.hostname === EXPECTED.dbHost &&
      url.port === EXPECTED.dbPort
    );
  } catch {
    return false;
  }
}

function readTomlString(text, key) {
  const keyPattern = escapeRegex(key);
  const match = text.match(
    new RegExp('^\\s*' + keyPattern + '\\s*=\\s*"([^"]+)"', 'mu'),
  );
  return match?.[1] ?? null;
}

function readTomlNumberInSection(text, section, key) {
  let currentSection = null;
  const keyPattern = escapeRegex(key);

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    const sectionMatch = line.match(/^\[([^\]]+)\]$/u);
    if (sectionMatch?.[1]) {
      currentSection = sectionMatch[1];
      continue;
    }
    if (currentSection !== section) continue;

    const keyMatch = line.match(
      new RegExp('^' + keyPattern + '\\s*=\\s*(\\d+)$', 'u'),
    );
    if (keyMatch?.[1]) return Number(keyMatch[1]);
  }
  return null;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

function parseCliArgs(argv) {
  return {
    applyMigration165: argv.includes('--apply-migration-165'),
  };
}

if (isMainModule(import.meta.url)) {
  const args = parseCliArgs(process.argv.slice(2));
  runProposalDeliveryLocalPreflight({
    applyMigration165: args.applyMigration165,
  })
    .then((result) => {
      if (result.migrationCommandExecuted) {
        console.log('NORMAL LOCAL Migration 165 apply flow passed');
      } else {
        console.log('NORMAL LOCAL proposal delivery preflight passed');
      }
    })
    .catch((error) => {
      console.error(
        error instanceof Error
          ? error.message
          : 'Proposal delivery local preflight failed',
      );
      process.exitCode = 1;
    });
}
