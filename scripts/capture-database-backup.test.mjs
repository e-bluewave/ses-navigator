import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildSupabaseDumpPlans,
  defaultSupabaseExecutable,
  evaluateCapturedDatabaseBackup,
  parsePostgresMajorVersion,
  requiredStorageDataExclusions,
  runDatabaseBackupCapture,
  validateDatabaseBackupCaptureRequest,
} from './capture-database-backup.mjs';

const validRoles = 'CREATE ROLE postgres;\nCREATE ROLE app_user;\n';
const validSchema = `-- Dumped from database version 17.6\nCREATE TABLE app.projects (\n  id bigint\n);\nCREATE TABLE audit.events (\n  id bigint\n);\n`;
const validData = `COPY app.projects (id) FROM stdin;\n1\n\\.\nCOPY audit.events (id) FROM stdin;\n1\n\\.\n`;

test('capture request requires runtime DB URL and output outside repository', () => {
  const missingUrl = validateDatabaseBackupCaptureRequest({
    environment: 'Staging',
    repoRoot: '/repo',
    outputDir: '/backup',
    databaseUrl: '',
  });
  assert.equal(missingUrl.complete, false);
  assert.ok(
    missingUrl.findings.includes('database-url-runtime-secret-required'),
  );

  const insideRepo = validateDatabaseBackupCaptureRequest({
    environment: 'Staging',
    repoRoot: '/repo',
    outputDir: '/repo/private-backup',
    databaseUrl: 'postgresql://runtime-secret',
  });
  assert.equal(insideRepo.complete, false);
  assert.ok(
    insideRepo.findings.includes('backup-output-must-be-outside-repository'),
  );
});

test('Windows default uses native supabase.exe while other platforms use supabase', () => {
  assert.equal(defaultSupabaseExecutable('win32'), 'supabase.exe');
  assert.equal(defaultSupabaseExecutable('linux'), 'supabase');
  assert.equal(defaultSupabaseExecutable('darwin'), 'supabase');
});

test('schema preserves pg_dump version header while data uses COPY and Storage exclusions', () => {
  const plans = buildSupabaseDumpPlans({
    databaseUrl: 'postgresql://runtime-secret',
    rolesPath: '/backup/roles.sql',
    schemaPath: '/backup/schema.sql',
    dataPath: '/backup/data.sql',
  });
  assert.equal(plans.length, 3);
  const schemaPlan = plans.find((plan) => plan.stage === 'schema');
  assert.ok(schemaPlan.args.includes('--keep-comments'));
  const dataPlan = plans.find((plan) => plan.stage === 'data');
  assert.ok(dataPlan.args.includes('--use-copy'));
  assert.ok(dataPlan.args.includes('--data-only'));
  for (const exclusion of requiredStorageDataExclusions) {
    assert.ok(dataPlan.args.includes(exclusion));
  }
});

test('postgres major version is parsed from pg_dump header', () => {
  assert.equal(parsePostgresMajorVersion(validSchema), 17);
  assert.equal(parsePostgresMajorVersion('CREATE TABLE app.x (id int);'), null);
});

test('captured artifacts produce semantic schema and role metrics', () => {
  const result = evaluateCapturedDatabaseBackup({
    rolesBuffer: Buffer.from(validRoles),
    schemaBuffer: Buffer.from(validSchema),
    dataBuffer: Buffer.from(validData),
  });
  assert.equal(result.complete, true);
  assert.equal(result.postgresMajorVersion, 17);
  assert.equal(result.applicationTableCount, 2);
  assert.equal(typeof result.applicationTableSetSha256, 'string');
  assert.equal(result.storageManagedSqlAbsent, true);
  assert.equal(Number.isInteger(result.customRoleCountDiscovered), true);
  assert.equal(Number.isInteger(result.reservedRoleCountDiscovered), true);
});

test('captured artifacts fail closed on Storage-managed SQL contamination', () => {
  const result = evaluateCapturedDatabaseBackup({
    rolesBuffer: Buffer.from(validRoles),
    schemaBuffer: Buffer.from(validSchema),
    dataBuffer: Buffer.from(
      `${validData}\nCOPY storage.objects (id) FROM stdin;\n1\n\\.\n`,
    ),
  });
  assert.equal(result.complete, false);
  assert.ok(
    result.findings.some((finding) =>
      finding.startsWith('storage-managed-sql-reference:'),
    ),
  );
});

test('runner writes three artifacts and a private manifest without logging secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sesn-db-backup-capture-'));
  const repoRoot = join(root, 'repo');
  const outputDir = join(root, 'backup');
  await mkdir(join(repoRoot, 'supabase', 'migrations'), { recursive: true });
  await writeFile(
    join(repoRoot, 'supabase', 'migrations', '001_init.sql'),
    'select 1;\n',
  );
  await writeFile(
    join(repoRoot, 'supabase', 'migrations', '002_more.sql'),
    'select 2;\n',
  );

  const logs = [];
  const times = [
    new Date('2026-09-10T00:00:00.000Z'),
    new Date('2026-09-10T00:00:03.000Z'),
  ];
  const runCommand = (_command, args) => {
    const target = args[args.indexOf('-f') + 1];
    if (target.endsWith('roles.sql')) writeFileSync(target, validRoles);
    if (target.endsWith('schema.sql')) writeFileSync(target, validSchema);
    if (target.endsWith('data.sql')) writeFileSync(target, validData);
    return { status: 0 };
  };

  try {
    const result = await runDatabaseBackupCapture({
      environment: 'Staging',
      repoRoot,
      outputDir,
      databaseUrl: 'postgresql://runtime-secret-value',
      supabaseExecutable: 'supabase-test',
      runCommand,
      now: () => times.shift(),
      log: (value) => logs.push(String(value)),
    });
    assert.equal(result.complete, true);
    assert.equal(result.manifest.artifacts.roles.fileName, 'roles.sql');
    assert.equal(result.manifest.artifacts.schema.fileName, 'schema.sql');
    assert.equal(result.manifest.artifacts.data.fileName, 'data.sql');
    assert.equal(result.manifest.migrationBaseline.migrationFileCount, 2);
    assert.equal(result.manifest.applicationSchemaBaseline.tableCount, 2);
    assert.equal(result.manifest.requiredStorageDataExclusionsApplied, true);
    assert.equal(result.manifest.secretFreeManifest, true);

    const manifestText = await readFile(
      join(outputDir, 'database-backup-capture.private.json'),
      'utf8',
    );
    assert.equal(manifestText.charCodeAt(0) === 0xfeff, false);
    assert.equal(manifestText.includes('runtime-secret-value'), false);
    assert.equal(logs.join('\n').includes('runtime-secret-value'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('runner stops after a failed dump and does not create a PASS manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sesn-db-backup-fail-'));
  const repoRoot = join(root, 'repo');
  const outputDir = join(root, 'backup');
  await mkdir(join(repoRoot, 'supabase', 'migrations'), { recursive: true });
  await writeFile(
    join(repoRoot, 'supabase', 'migrations', '001_init.sql'),
    'select 1;\n',
  );
  let callCount = 0;
  const runCommand = (_command, args) => {
    callCount += 1;
    const target = args[args.indexOf('-f') + 1];
    if (callCount === 1) writeFileSync(target, validRoles);
    return { status: callCount === 2 ? 1 : 0 };
  };

  try {
    await assert.rejects(
      runDatabaseBackupCapture({
        environment: 'Staging',
        repoRoot,
        outputDir,
        databaseUrl: 'postgresql://runtime-secret-value',
        runCommand,
        log: () => {},
      }),
      /schema stage/u,
    );
    await assert.rejects(
      readFile(join(outputDir, 'database-backup-capture.private.json')),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
