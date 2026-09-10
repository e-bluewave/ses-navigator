import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isMainModule } from './cli-entry.mjs';
import { prepareSpawnSyncInvocation } from './windows-cmd-spawn.mjs';
import {
  decodeStrictUtf8,
  inspectRestoreSqlArtifacts,
} from './restore-drill-preflight.mjs';
import { parseExpectedApplicationTables } from './restore-db-semantic-parity.mjs';

export const requiredStorageDataExclusions = [
  'storage.buckets',
  'storage.objects',
  'storage.buckets_vectors',
  'storage.vector_indexes',
];

const allowedEnvironments = new Set(['Staging', 'Production']);

export function validateDatabaseBackupCaptureRequest({
  environment,
  repoRoot,
  outputDir,
  databaseUrl,
} = {}) {
  const findings = [];
  if (!allowedEnvironments.has(environment)) {
    findings.push('environment-must-be-staging-or-production');
  }
  if (!isNonBlankString(repoRoot)) findings.push('repo-root-required');
  if (!isNonBlankString(outputDir)) findings.push('output-dir-required');
  if (!isNonBlankString(databaseUrl)) {
    findings.push('database-url-runtime-secret-required');
  } else if (!/^postgres(?:ql)?:\/\//iu.test(databaseUrl)) {
    findings.push('database-url-must-be-postgres-url');
  }
  if (
    isNonBlankString(repoRoot) &&
    isNonBlankString(outputDir) &&
    isPathInside(resolve(repoRoot), resolve(outputDir))
  ) {
    findings.push('backup-output-must-be-outside-repository');
  }
  return {
    status:
      findings.length === 0
        ? 'DATABASE_BACKUP_CAPTURE_REQUEST_PASSED'
        : 'DATABASE_BACKUP_CAPTURE_REQUEST_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export function buildSupabaseDumpPlans({
  databaseUrl,
  rolesPath,
  schemaPath,
  dataPath,
}) {
  return [
    {
      stage: 'roles',
      args: [
        'db',
        'dump',
        '--db-url',
        databaseUrl,
        '-f',
        rolesPath,
        '--role-only',
      ],
    },
    {
      stage: 'schema',
      args: ['db', 'dump', '--db-url', databaseUrl, '-f', schemaPath],
    },
    {
      stage: 'data',
      args: [
        'db',
        'dump',
        '--db-url',
        databaseUrl,
        '-f',
        dataPath,
        '--use-copy',
        '--data-only',
        ...requiredStorageDataExclusions.flatMap((value) => ['-x', value]),
      ],
    },
  ];
}

export function parsePostgresMajorVersion(schemaText) {
  const match = /Dumped\s+from\s+database\s+version\s+(\d+)/iu.exec(
    String(schemaText ?? ''),
  );
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function evaluateCapturedDatabaseBackup({
  rolesBuffer,
  schemaBuffer,
  dataBuffer,
} = {}) {
  const findings = [];
  const decoded = {};
  for (const [label, buffer] of [
    ['roles', rolesBuffer],
    ['schema', schemaBuffer],
    ['data', dataBuffer],
  ]) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      findings.push(`${label}-artifact-must-be-non-empty`);
      decoded[label] = { text: '', findings: [] };
      continue;
    }
    const result = decodeStrictUtf8(buffer, label);
    decoded[label] = result;
    findings.push(...result.findings);
  }

  let sqlInspection = {
    findings: [],
    customRoleCountDiscovered: null,
    reservedRoleCountDiscovered: null,
  };
  if (findings.length === 0) {
    sqlInspection = inspectRestoreSqlArtifacts({
      rolesText: decoded.roles.text,
      schemaText: decoded.schema.text,
      dataText: decoded.data.text,
    });
    findings.push(...sqlInspection.findings);
  }

  const postgresMajorVersion = parsePostgresMajorVersion(decoded.schema.text);
  if (!Number.isInteger(postgresMajorVersion)) {
    findings.push('postgres-major-version-not-found-in-schema-dump');
  }

  const applicationTables = parseExpectedApplicationTables(decoded.schema.text);
  if (applicationTables.length === 0) {
    findings.push('application-schema-baseline-empty');
  }

  return {
    status:
      findings.length === 0
        ? 'DATABASE_BACKUP_ARTIFACTS_PASSED'
        : 'DATABASE_BACKUP_ARTIFACTS_FAILED',
    complete: findings.length === 0,
    findings,
    postgresMajorVersion,
    applicationTableCount: applicationTables.length,
    applicationTableSetSha256:
      applicationTables.length > 0
        ? sha256Text(applicationTables.join('\n'))
        : null,
    customRoleCountDiscovered: sqlInspection.customRoleCountDiscovered,
    reservedRoleCountDiscovered: sqlInspection.reservedRoleCountDiscovered,
    storageManagedSqlAbsent: sqlInspection.findings.length === 0,
  };
}

export async function buildMigrationBaseline({ repoRoot }) {
  const migrationDir = join(resolve(repoRoot), 'supabase', 'migrations');
  const names = (await readdir(migrationDir))
    .filter((name) => name.toLowerCase().endsWith('.sql'))
    .sort();
  if (names.length === 0) {
    throw new Error('Repository migration baseline is empty');
  }

  const entries = [];
  for (const name of names) {
    const buffer = await readFile(join(migrationDir, name));
    entries.push(`${name}:${sha256Buffer(buffer)}`);
  }
  return {
    method: 'repository-migration-set-sha256',
    migrationFileCount: names.length,
    headMigrationFile: names.at(-1),
    migrationSetSha256: sha256Text(entries.join('\n')),
  };
}

export function buildDatabaseBackupCaptureManifest({
  environment,
  startedAt,
  completedAt,
  artifactMetadata,
  artifactEvaluation,
  migrationBaseline,
} = {}) {
  if (artifactEvaluation?.complete !== true) {
    throw new Error('Backup artifacts must pass before manifest generation');
  }
  return {
    version: 1,
    backupRunId: `BA006-DB-CAPTURE-${formatRunTimestamp(startedAt)}`,
    environment,
    startedAt,
    completedAt,
    postgresMajorVersion: artifactEvaluation.postgresMajorVersion,
    dataUsedCopy: true,
    requiredStorageDataExclusionsApplied: true,
    requiredStorageDataExclusions: [...requiredStorageDataExclusions],
    customRoleCountDiscovered: artifactEvaluation.customRoleCountDiscovered,
    reservedRoleCountDiscovered: artifactEvaluation.reservedRoleCountDiscovered,
    migrationBaseline,
    applicationSchemaBaseline: {
      method: 'app-audit-table-set-sha256',
      tableCount: artifactEvaluation.applicationTableCount,
      tableSetSha256: artifactEvaluation.applicationTableSetSha256,
    },
    artifacts: artifactMetadata,
    secretOrPersonalDataExposed: false,
    secretFreeManifest: true,
  };
}

export async function runDatabaseBackupCapture({
  environment,
  repoRoot = '.',
  outputDir,
  databaseUrl = process.env.SESN_DB_URL,
  supabaseExecutable = defaultSupabaseExecutable(),
  runCommand = runCommandSafe,
  now = () => new Date(),
  log = console.log,
} = {}) {
  const request = validateDatabaseBackupCaptureRequest({
    environment,
    repoRoot,
    outputDir,
    databaseUrl,
  });
  if (!request.complete) {
    log(
      JSON.stringify(
        {
          status: request.status,
          findingCount: request.findings.length,
          findings: request.findings,
          secretFreeOutput: true,
        },
        null,
        2,
      ),
    );
    throw new Error(
      `Database backup capture request failed (${request.findings.length})`,
    );
  }

  const resolvedRepoRoot = resolve(repoRoot);
  const resolvedOutputDir = resolve(outputDir);
  const migrationBaseline = await buildMigrationBaseline({
    repoRoot: resolvedRepoRoot,
  });

  await mkdir(resolvedOutputDir, { recursive: true });
  const rolesPath = join(resolvedOutputDir, 'roles.sql');
  const schemaPath = join(resolvedOutputDir, 'schema.sql');
  const dataPath = join(resolvedOutputDir, 'data.sql');
  const manifestPath = join(
    resolvedOutputDir,
    'database-backup-capture.private.json',
  );
  for (const path of [rolesPath, schemaPath, dataPath, manifestPath]) {
    await assertPathDoesNotExist(path);
  }

  const startedAt = now().toISOString();
  const plans = buildSupabaseDumpPlans({
    databaseUrl,
    rolesPath,
    schemaPath,
    dataPath,
  });

  for (const plan of plans) {
    const result = runCommand(supabaseExecutable, plan.args);
    if (result.status !== 0) {
      throw new Error(`Database backup dump failed at ${plan.stage} stage`);
    }
  }

  const [rolesBuffer, schemaBuffer, dataBuffer] = await Promise.all([
    readFile(rolesPath),
    readFile(schemaPath),
    readFile(dataPath),
  ]);
  const artifactEvaluation = evaluateCapturedDatabaseBackup({
    rolesBuffer,
    schemaBuffer,
    dataBuffer,
  });
  if (!artifactEvaluation.complete) {
    log(
      JSON.stringify(
        {
          status: artifactEvaluation.status,
          findingCount: artifactEvaluation.findings.length,
          findings: artifactEvaluation.findings,
          secretFreeOutput: true,
        },
        null,
        2,
      ),
    );
    throw new Error(
      `Database backup artifact validation failed (${artifactEvaluation.findings.length})`,
    );
  }

  const artifactMetadata = {
    roles: await metadataForArtifact('roles.sql', rolesPath, rolesBuffer),
    schema: await metadataForArtifact('schema.sql', schemaPath, schemaBuffer),
    data: await metadataForArtifact('data.sql', dataPath, dataBuffer),
  };
  const completedAt = now().toISOString();
  const manifest = buildDatabaseBackupCaptureManifest({
    environment,
    startedAt,
    completedAt,
    artifactMetadata,
    artifactEvaluation,
    migrationBaseline,
  });
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  const result = {
    status: 'DATABASE_BACKUP_CAPTURE_PASSED',
    complete: true,
    environment,
    postgresMajorVersion: artifactEvaluation.postgresMajorVersion,
    applicationTableCount: artifactEvaluation.applicationTableCount,
    customRoleCountDiscovered: artifactEvaluation.customRoleCountDiscovered,
    reservedRoleCountDiscovered: artifactEvaluation.reservedRoleCountDiscovered,
    migrationFileCount: migrationBaseline.migrationFileCount,
    requiredStorageDataExclusionsApplied: true,
    artifactCount: 3,
    manifestWritten: true,
    secretFreeOutput: true,
  };
  log(JSON.stringify(result, null, 2));
  return { ...result, manifest };
}

async function metadataForArtifact(fileName, path, buffer) {
  const info = await stat(path);
  return {
    fileName,
    sizeBytes: info.size,
    sha256: sha256Buffer(buffer),
  };
}

function runCommandSafe(command, args) {
  const invocation = prepareSpawnSyncInvocation({
    command,
    args,
    envPrefix: 'SESN_DB_CAPTURE',
  });
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: invocation.env,
  });
  return {
    status: typeof result.status === 'number' ? result.status : 1,
    spawnErrorCode:
      result.error && typeof result.error.code === 'string'
        ? result.error.code
        : null,
  };
}

function defaultSupabaseExecutable() {
  return process.platform === 'win32' ? 'supabase.cmd' : 'supabase';
}

async function assertPathDoesNotExist(path) {
  try {
    await access(path);
  } catch {
    return;
  }
  throw new Error('Backup output already exists; use a fresh output directory');
}

function isPathInside(parent, candidate) {
  const rel = relative(parent, candidate);
  return (
    rel === '' ||
    (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
  );
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function formatRunTimestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new Error('Invalid backup start time');
  return parsed
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z');
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim() !== '';
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
  runDatabaseBackupCapture({
    environment: args.environment,
    repoRoot: args['repo-root'] ?? process.cwd(),
    outputDir: args['output-dir'],
  }).catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Database backup capture failed',
    );
    process.exitCode = 1;
  });
}
