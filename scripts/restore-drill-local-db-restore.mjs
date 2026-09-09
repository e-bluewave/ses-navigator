import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';
import { runLocalRestorePreflight } from './restore-drill-local-preflight.mjs';

const applicationTablePattern =
  /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?(?:app|audit)"?)\.(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_]*)\s*\(/gimu;

const restoredTableCountSql = String.raw`
SELECT count(*)::integer
FROM pg_class AS c
JOIN pg_namespace AS n
  ON n.oid = c.relnamespace
WHERE n.nspname IN ('app', 'audit')
  AND c.relkind IN ('r', 'p');
`;

export function countExpectedApplicationTables(schemaSql) {
  const matches = String(schemaSql ?? '').match(applicationTablePattern);
  return matches?.length ?? 0;
}

export function parseRestoredTableCount(stdout) {
  const text = String(stdout ?? '').trim();
  if (!/^\d+$/u.test(text)) return null;
  const value = Number.parseInt(text, 10);
  return Number.isSafeInteger(value) ? value : null;
}

export function evaluateLocalDbRestoreResult({
  restoreExitCode,
  expectedApplicationTableCount,
  restoredApplicationTableCount,
  customRoleCountDiscovered,
}) {
  const findings = [];

  if (customRoleCountDiscovered !== 0) {
    findings.push('automatic-local-db-restore-requires-empty-custom-role-set');
  }
  if (restoreExitCode !== 0) {
    findings.push('database-restore-command-failed');
  }
  if (
    !Number.isInteger(expectedApplicationTableCount) ||
    expectedApplicationTableCount <= 0
  ) {
    findings.push('expected-application-table-count-required');
  }
  if (
    !Number.isInteger(restoredApplicationTableCount) ||
    restoredApplicationTableCount < 0
  ) {
    findings.push('restored-application-table-count-required');
  }
  if (
    Number.isInteger(expectedApplicationTableCount) &&
    expectedApplicationTableCount > 0 &&
    Number.isInteger(restoredApplicationTableCount) &&
    restoredApplicationTableCount !== expectedApplicationTableCount
  ) {
    findings.push('restored-application-table-count-mismatch');
  }

  const complete = findings.length === 0;
  return {
    status: complete ? 'LOCAL_DB_RESTORE_PASSED' : 'LOCAL_DB_RESTORE_FAILED',
    complete,
    findings,
    databaseRestoreTransactional: true,
    databaseOnErrorStop: true,
    customRoleReplay: 'INTENTIONAL_SKIP_EMPTY_CUSTOM_SET',
    schemaRestore: complete ? 'PASS' : 'FAIL',
    dataRestore: complete ? 'PASS' : 'FAIL',
    expectedApplicationTableCount,
    restoredApplicationTableCount,
  };
}

export async function runLocalDbRestore({
  factsPath,
  rolesPath,
  schemaPath,
  dataPath,
  repoRoot = '.',
  environment,
  containerName,
  requiredNameToken,
  runCommand = runCommandSafe,
  log = console.log,
} = {}) {
  const preflight = await runLocalRestorePreflight({
    factsPath,
    rolesPath,
    schemaPath,
    dataPath,
    repoRoot,
    environment,
    containerName,
    requiredNameToken,
    log: () => {},
  });

  if (preflight.customRoleCountDiscovered !== 0) {
    const result = evaluateLocalDbRestoreResult({
      restoreExitCode: null,
      expectedApplicationTableCount: null,
      restoredApplicationTableCount: null,
      customRoleCountDiscovered: preflight.customRoleCountDiscovered,
    });
    log(JSON.stringify(result, null, 2));
    throw new Error(`Local DB restore failed (${result.findings.length})`);
  }

  const [schemaSql, dataSql] = await Promise.all([
    readFile(schemaPath, 'utf8'),
    readFile(dataPath, 'utf8'),
  ]);
  const expectedApplicationTableCount =
    countExpectedApplicationTables(schemaSql);

  if (expectedApplicationTableCount <= 0) {
    const result = evaluateLocalDbRestoreResult({
      restoreExitCode: null,
      expectedApplicationTableCount,
      restoredApplicationTableCount: null,
      customRoleCountDiscovered: preflight.customRoleCountDiscovered,
    });
    log(JSON.stringify(result, null, 2));
    throw new Error(`Local DB restore failed (${result.findings.length})`);
  }

  const startedAt = Date.now();
  const restoreResult = runCommand(
    'docker',
    [
      'exec',
      '-i',
      containerName ?? '',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-X',
      '--single-transaction',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '-',
    ],
    `${schemaSql}\n${dataSql}\n`,
  );
  const restoreDurationMilliseconds = Date.now() - startedAt;

  let restoredApplicationTableCount = null;
  if (restoreResult.status === 0) {
    const countResult = runCommand(
      'docker',
      [
        'exec',
        '-i',
        containerName ?? '',
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-X',
        '-A',
        '-t',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        restoredTableCountSql,
      ],
      '',
    );
    if (countResult.status === 0) {
      restoredApplicationTableCount = parseRestoredTableCount(
        countResult.stdout,
      );
    }
  }

  const result = evaluateLocalDbRestoreResult({
    restoreExitCode: restoreResult.status,
    expectedApplicationTableCount,
    restoredApplicationTableCount,
    customRoleCountDiscovered: preflight.customRoleCountDiscovered,
  });

  const output = {
    ...result,
    preflight: 'PASS',
    processExitCode: restoreResult.status,
    restoreDurationMilliseconds,
    secretFreeOutput: true,
  };
  log(JSON.stringify(output, null, 2));

  if (!result.complete) {
    throw new Error(`Local DB restore failed (${result.findings.length})`);
  }
  return output;
}

function runCommandSafe(command, args, input) {
  const result = spawnSync(command, args, {
    input,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function parseCliArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) continue;
    values[key.slice(2)] = value;
    index += 1;
  }
  return values;
}

if (isMainModule(import.meta.url)) {
  const args = parseCliArgs(process.argv.slice(2));
  runLocalDbRestore({
    factsPath: args.facts,
    rolesPath: args.roles,
    schemaPath: args.schema,
    dataPath: args.data,
    repoRoot: args.repo ?? '.',
    environment: args.environment,
    containerName: args.container,
    requiredNameToken: args['required-name-token'],
  }).catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Local DB restore failed',
    );
    process.exitCode = 1;
  });
}
