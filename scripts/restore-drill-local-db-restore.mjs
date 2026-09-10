import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';
import {
  buildRestoredApplicationTablesSql,
  buildRestoredTombstoneSql,
  compareApplicationTableSets,
  parseBackupTombstones,
  parseExpectedApplicationTables,
  parseRestoredApplicationTables,
  parseRestoredTombstoneCounts,
  summarizeTombstoneParity,
} from './restore-db-semantic-parity.mjs';
import { runLocalRestorePreflight } from './restore-drill-local-preflight.mjs';

export function countExpectedApplicationTables(schemaSql) {
  return parseExpectedApplicationTables(schemaSql).length;
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
  tableSetParity,
  tombstoneParity,
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
  if (tableSetParity?.complete !== true) {
    findings.push('restored-application-table-set-mismatch');
  }
  if (tombstoneParity?.complete !== true) {
    findings.push('deletion-tombstone-parity-mismatch');
  }

  const schemaComplete =
    customRoleCountDiscovered === 0 &&
    restoreExitCode === 0 &&
    Number.isInteger(expectedApplicationTableCount) &&
    expectedApplicationTableCount > 0 &&
    Number.isInteger(restoredApplicationTableCount) &&
    restoredApplicationTableCount === expectedApplicationTableCount &&
    tableSetParity?.complete === true;
  const dataComplete = schemaComplete && tombstoneParity?.complete === true;
  const complete = schemaComplete && dataComplete && findings.length === 0;

  return {
    status: complete ? 'LOCAL_DB_RESTORE_PASSED' : 'LOCAL_DB_RESTORE_FAILED',
    complete,
    findings,
    databaseRestoreTransactional: true,
    databaseOnErrorStop: true,
    customRoleReplay: 'INTENTIONAL_SKIP_EMPTY_CUSTOM_SET',
    schemaRestore: schemaComplete ? 'PASS' : 'FAIL',
    dataRestore: dataComplete ? 'PASS' : 'FAIL',
    migrationParity: tableSetParity?.complete === true ? 'PASS' : 'FAIL',
    deletionTombstonesReapplied:
      tombstoneParity?.complete === true ? 'PASS' : 'FAIL',
    expectedApplicationTableCount,
    restoredApplicationTableCount,
    missingApplicationTableCount: tableSetParity?.missingTableCount ?? null,
    extraApplicationTableCount: tableSetParity?.extraTableCount ?? null,
    tombstoneTableCount: tombstoneParity?.tombstoneTableCount ?? null,
    expectedTombstoneCount: tombstoneParity?.expectedTombstoneCount ?? null,
    restoredTombstoneCount: tombstoneParity?.restoredTombstoneCount ?? null,
    tombstoneMismatchCount: tombstoneParity?.tombstoneMismatchCount ?? null,
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
      tableSetParity: null,
      tombstoneParity: null,
    });
    log(JSON.stringify(result, null, 2));
    throw new Error(`Local DB restore failed (${result.findings.length})`);
  }

  const [schemaSql, dataSql] = await Promise.all([
    readFile(schemaPath, 'utf8'),
    readFile(dataPath, 'utf8'),
  ]);
  const expectedApplicationTables = parseExpectedApplicationTables(schemaSql);
  const expectedApplicationTableCount = expectedApplicationTables.length;
  const tombstoneExpectations = parseBackupTombstones(dataSql);

  if (expectedApplicationTableCount <= 0) {
    const result = evaluateLocalDbRestoreResult({
      restoreExitCode: null,
      expectedApplicationTableCount,
      restoredApplicationTableCount: null,
      customRoleCountDiscovered: preflight.customRoleCountDiscovered,
      tableSetParity: null,
      tombstoneParity: null,
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

  let restoredApplicationTables = null;
  let restoredApplicationTableCount = null;
  let tableSetParity = null;
  let tombstoneParity = null;

  if (restoreResult.status === 0) {
    const tableResult = runCommand(
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
        buildRestoredApplicationTablesSql(),
      ],
      '',
    );
    if (tableResult.status === 0) {
      restoredApplicationTables = parseRestoredApplicationTables(
        tableResult.stdout,
      );
      if (restoredApplicationTables) {
        restoredApplicationTableCount = restoredApplicationTables.length;
        tableSetParity = compareApplicationTableSets(
          expectedApplicationTables,
          restoredApplicationTables,
        );
      }
    }

    if (tombstoneExpectations.length === 0) {
      tombstoneParity = summarizeTombstoneParity([]);
    } else {
      const tombstoneSql = buildRestoredTombstoneSql(tombstoneExpectations);
      const tombstoneResult = runCommand(
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
          tombstoneSql,
        ],
        '',
      );
      if (tombstoneResult.status === 0) {
        const comparisons = parseRestoredTombstoneCounts(
          tombstoneResult.stdout,
          tombstoneExpectations,
        );
        tombstoneParity = summarizeTombstoneParity(comparisons);
      }
    }
  }

  const result = evaluateLocalDbRestoreResult({
    restoreExitCode: restoreResult.status,
    expectedApplicationTableCount,
    restoredApplicationTableCount,
    customRoleCountDiscovered: preflight.customRoleCountDiscovered,
    tableSetParity,
    tombstoneParity,
  });

  const output = {
    ...result,
    preflight: 'PASS',
    processExitCode: restoreResult.status,
    restoreDurationMilliseconds,
    migrationParityMethod: 'BA006_BACKUP_SCHEMA_TO_RESTORED_DB_EXACT_TABLE_SET',
    deletionTombstoneParityMethod:
      'BA006_DATA_COPY_DELETED_AT_TO_RESTORED_DB_COUNT',
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
