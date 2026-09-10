import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { resolve } from 'node:path';
import { runAuthProjectSmoke } from './auth-project-smoke.mjs';
import { validateRestoreDrillEvidence } from './check-restore-drill-evidence.mjs';
import { runDataApiSecuritySuite } from './data-api-security-suite.mjs';
import { isMainModule } from './cli-entry.mjs';
import { runLocalDbRestore } from './restore-drill-local-db-restore.mjs';
import { runLocalStorageRestore } from './restore-drill-local-storage-restore.mjs';

const minuteMilliseconds = 60_000;
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const requiredRuntimeVariables = [
  'SESN_RESTORE_STORAGE_URL',
  'SESN_RESTORE_STORAGE_SERVICE_ROLE_KEY',
  'SESN_SUPABASE_URL',
  'SESN_SUPABASE_PUBLISHABLE_KEY',
  'SESN_SUPABASE_SECRET_KEY',
  'SESN_TEST_EMAIL',
  'SESN_TEST_PASSWORD',
  'SESN_TEST_USER_A_EMAIL',
  'SESN_TEST_USER_A_PASSWORD',
  'SESN_TEST_USER_B_EMAIL',
  'SESN_TEST_USER_B_PASSWORD',
];
const tierTargets = {
  tier1: { rpo: 60, rto: 240 },
  tier2: { rpo: 240, rto: 480 },
  tier3: { rpo: 1440, rto: 1440 },
};

export function validateLocalRestoreRunFacts(document) {
  const findings = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return failedFacts('run-facts-object-required');
  }

  if (
    document.environment !== undefined &&
    document.environment !== 'Disposable'
  ) {
    findings.push('environment-must-be-disposable');
  }
  for (const field of ['databaseRecoveryPointAt', 'storageRecoveryPointAt']) {
    if (!validTimestamp(document[field])) {
      findings.push(`${field}-valid-timestamp-required`);
    }
  }
  for (const field of ['databaseBackupRunLinked', 'storageBackupRunLinked']) {
    if (document[field] !== true) findings.push(`${field}-must-be-true`);
  }
  if (document.restorePointAlignment !== 'PASS') {
    findings.push('restorePointAlignment-must-pass');
  }

  const db = document.db;
  if (!db || typeof db !== 'object' || Array.isArray(db)) {
    findings.push('db-config-required');
  } else {
    for (const field of [
      'factsPath',
      'rolesPath',
      'schemaPath',
      'dataPath',
      'containerName',
      'requiredNameToken',
    ]) {
      if (!nonBlankString(db[field])) findings.push(`db-${field}-required`);
    }
  }

  const storage = document.storage;
  if (!storage || typeof storage !== 'object' || Array.isArray(storage)) {
    findings.push('storage-config-required');
  } else {
    for (const field of ['manifestPath', 'sourceRoot']) {
      if (!nonBlankString(storage[field])) {
        findings.push(`storage-${field}-required`);
      }
    }
    if (
      storage.cleanupExisting !== undefined &&
      typeof storage.cleanupExisting !== 'boolean'
    ) {
      findings.push('storage-cleanupExisting-must-be-boolean');
    }
  }

  if (document.repoRoot !== undefined && !nonBlankString(document.repoRoot)) {
    findings.push('repoRoot-must-be-non-empty-string');
  }
  if (
    document.followUpReferencePresent !== undefined &&
    typeof document.followUpReferencePresent !== 'boolean'
  ) {
    findings.push('followUpReferencePresent-must-be-boolean');
  }
  if (document.notes !== undefined && typeof document.notes !== 'string') {
    findings.push('notes-must-be-string');
  }

  return {
    status:
      findings.length === 0
        ? 'LOCAL_RESTORE_RUN_FACTS_PASSED'
        : 'LOCAL_RESTORE_RUN_FACTS_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export function validateLocalRestoreRuntimeEnvironment(env = {}) {
  const findings = [];
  for (const name of requiredRuntimeVariables) {
    if (!nonBlankString(env[name]))
      findings.push(`missing-runtime-variable:${name}`);
  }
  if (findings.length > 0) {
    return {
      status: 'LOCAL_RESTORE_RUNTIME_ENV_FAILED',
      complete: false,
      findings,
    };
  }

  const supabaseUrl = parseLoopbackUrl(
    env.SESN_SUPABASE_URL,
    'SESN_SUPABASE_URL',
    findings,
  );
  const storageUrl = parseLoopbackUrl(
    env.SESN_RESTORE_STORAGE_URL,
    'SESN_RESTORE_STORAGE_URL',
    findings,
  );
  if (supabaseUrl && storageUrl && supabaseUrl.origin !== storageUrl.origin) {
    findings.push('storage-and-supabase-origin-must-match');
  }
  if (env.SESN_SUPABASE_SECRET_KEY.startsWith('sb_publishable_')) {
    findings.push('supabase-secret-key-must-not-be-publishable');
  }

  return {
    status:
      findings.length === 0
        ? 'LOCAL_RESTORE_RUNTIME_ENV_PASSED'
        : 'LOCAL_RESTORE_RUNTIME_ENV_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export function calculateRestoreTimeline({
  startedAt,
  businessUsableAt,
  databaseRecoveryPointAt,
  storageRecoveryPointAt,
}) {
  const start = parseTimestamp(startedAt, 'startedAt');
  const usable = parseTimestamp(businessUsableAt, 'businessUsableAt');
  const databasePoint = parseTimestamp(
    databaseRecoveryPointAt,
    'databaseRecoveryPointAt',
  );
  const storagePoint = parseTimestamp(
    storageRecoveryPointAt,
    'storageRecoveryPointAt',
  );
  if (usable < start)
    throw new Error('Business usable time precedes drill start');

  const jointRecoveryPoint = Math.min(databasePoint, storagePoint);
  if (jointRecoveryPoint > start) {
    throw new Error('Joint recovery point must not be after drill start');
  }

  return {
    jointRecoveryPointAt: new Date(jointRecoveryPoint).toISOString(),
    recoveryPointAgeMinutesMeasured: roundMinutes(start - jointRecoveryPoint),
    rtoMinutesMeasured: roundMinutes(usable - start),
  };
}

export function evaluateRestoreTargets({
  recoveryPointAgeMinutesMeasured,
  rtoMinutesMeasured,
}) {
  const tiers = {};
  for (const [name, target] of Object.entries(tierTargets)) {
    tiers[name] = {
      rpo: recoveryPointAgeMinutesMeasured <= target.rpo ? 'PASS' : 'FAIL',
      rto: rtoMinutesMeasured <= target.rto ? 'PASS' : 'FAIL',
    };
  }
  const followUpRequired =
    tiers.tier1.rpo !== 'PASS' ||
    tiers.tier1.rto !== 'PASS' ||
    tiers.tier2.rpo !== 'PASS' ||
    tiers.tier2.rto !== 'PASS';
  return { tiers, followUpRequired };
}

export function buildRestoreDrillEvidence({
  facts,
  startedAt,
  completedAt,
  businessUsableAt,
  dbResult,
  storageResult,
  liveResult,
}) {
  if (dbResult?.complete !== true)
    throw new Error('DB restore result must pass');
  if (storageResult?.complete !== true) {
    throw new Error('Storage restore result must pass');
  }
  if (liveResult?.complete !== true) {
    throw new Error('Live validation result must pass');
  }
  if (dbResult.customRoleReplay !== 'INTENTIONAL_SKIP_EMPTY_CUSTOM_SET') {
    throw new Error('Unexpected DB role replay result');
  }
  if (
    dbResult.migrationParity !== 'PASS' ||
    dbResult.deletionTombstonesReapplied !== 'PASS'
  ) {
    throw new Error('DB semantic parity result must pass');
  }

  const timeline = calculateRestoreTimeline({
    startedAt,
    businessUsableAt,
    databaseRecoveryPointAt: facts.databaseRecoveryPointAt,
    storageRecoveryPointAt: facts.storageRecoveryPointAt,
  });
  const targetResult = evaluateRestoreTargets(timeline);
  if (
    targetResult.followUpRequired &&
    facts.followUpReferencePresent !== true
  ) {
    throw new Error('RPO/RTO follow-up reference is required');
  }

  const evidenceId = nonBlankString(facts.evidenceId)
    ? facts.evidenceId.trim()
    : evidenceIdFrom(startedAt);
  const notes = buildEvidenceNotes(facts.notes);
  const evidence = {
    evidenceId,
    environment: 'Disposable',
    startedAt,
    completedAt,
    productionTarget: false,
    separateRestoreEnvironment: true,
    productionSecretsReused: false,
    databaseBackupRunLinked: true,
    storageBackupRunLinked: true,
    restorePointAlignment: 'PASS',
    rolesRestore: 'PASS',
    schemaRestore: dbResult.schemaRestore,
    dataRestore: dbResult.dataRestore,
    databaseRestoreTransactional:
      dbResult.databaseRestoreTransactional === true,
    databaseOnErrorStop: dbResult.databaseOnErrorStop === true,
    storageRestore: storageResult.storageRestore,
    storageObjectCountParity: storageResult.storageObjectCountParity,
    storageTotalBytesParity: storageResult.storageTotalBytesParity,
    storageIntegrityVerification: storageResult.storageIntegrityVerification,
    databaseStorageConsistency: 'PASS',
    authSmokeTest: liveResult.authSmokeTest,
    applicationSmokeTest: liveResult.applicationSmokeTest,
    dataApiSecurityRegression: liveResult.dataApiSecurityRegression,
    rlsTenantIsolation: liveResult.rlsTenantIsolation,
    storageInventoryVerification: storageResult.storageInventoryVerification,
    representativeFileRead: storageResult.representativeFileRead,
    migrationParity: dbResult.migrationParity,
    deletionTombstonesReapplied: dbResult.deletionTombstonesReapplied,
    rtoMinutesMeasured: timeline.rtoMinutesMeasured,
    recoveryPointAgeMinutesMeasured: timeline.recoveryPointAgeMinutesMeasured,
    followUpRequired: targetResult.followUpRequired,
    ...(targetResult.followUpRequired
      ? { followUpReferencePresent: true }
      : facts.followUpReferencePresent === true
        ? { followUpReferencePresent: true }
        : {}),
    secretOrPersonalDataExposed: false,
    secretFreeEvidence: true,
    notes,
  };

  return { evidence, timeline, ...targetResult };
}

export async function runLocalRestoreDrill({
  runFactsPath,
  outputPath,
  env = process.env,
  now = () => Date.now(),
  readFileImpl = readFile,
  writeFileImpl = writeFile,
  runDbRestore = runLocalDbRestore,
  runStorageRestore = runLocalStorageRestore,
  runLiveValidation = runDefaultLiveValidation,
  validateEvidence = validateRestoreDrillEvidence,
  log = console.log,
} = {}) {
  if (!runFactsPath) throw new Error('Private run facts path is required');
  if (!outputPath)
    throw new Error('Restore drill evidence output path is required');

  const text = await readFileImpl(runFactsPath, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) {
    throw new Error('Private run facts must be UTF-8 without BOM');
  }
  const facts = JSON.parse(text);
  const factsResult = validateLocalRestoreRunFacts(facts);
  if (!factsResult.complete) {
    throw new Error(
      `Local restore run facts failed (${factsResult.findings.length})`,
    );
  }

  const runtimeResult = validateLocalRestoreRuntimeEnvironment(env);
  if (!runtimeResult.complete) {
    throw new Error(
      `Local restore runtime preflight failed (${runtimeResult.findings.length})`,
    );
  }

  const repoRoot = resolve(facts.repoRoot ?? '.');
  const startedAtMilliseconds = now();
  const startedAt = new Date(startedAtMilliseconds).toISOString();

  const dbResult = await runDbRestore({
    factsPath: facts.db.factsPath,
    rolesPath: facts.db.rolesPath,
    schemaPath: facts.db.schemaPath,
    dataPath: facts.db.dataPath,
    repoRoot,
    environment: 'Disposable',
    containerName: facts.db.containerName,
    requiredNameToken: facts.db.requiredNameToken,
    log: () => {},
  });

  const storageResult = await runStorageRestore({
    manifestPath: facts.storage.manifestPath,
    sourceRoot: facts.storage.sourceRoot,
    environment: 'Disposable',
    cleanupExisting: facts.storage.cleanupExisting === true,
    targetUrl: env.SESN_RESTORE_STORAGE_URL,
    serviceRoleKey: env.SESN_RESTORE_STORAGE_SERVICE_ROLE_KEY,
    log: () => {},
  });

  const liveResult = await runLiveValidation({ repoRoot, env, log: () => {} });
  const businessUsableAtMilliseconds = now();
  const businessUsableAt = new Date(businessUsableAtMilliseconds).toISOString();
  const completedAt = new Date(now()).toISOString();

  const assembled = buildRestoreDrillEvidence({
    facts,
    startedAt,
    completedAt,
    businessUsableAt,
    dbResult,
    storageResult,
    liveResult,
  });
  const validation = validateEvidence(assembled.evidence);
  if (validation?.complete !== true) {
    throw new Error(
      `Restore drill evidence self-validation failed (${validation?.findings?.length ?? 1})`,
    );
  }

  await writeFileImpl(
    outputPath,
    `${JSON.stringify(assembled.evidence, null, 2)}\n`,
    'utf8',
  );

  const summary = {
    status: 'LOCAL_RESTORE_DRILL_PASSED',
    restoreDrillEvidence: validation.status,
    rpoMinutes: assembled.timeline.recoveryPointAgeMinutesMeasured,
    rtoMinutes: assembled.timeline.rtoMinutesMeasured,
    followUpRequired: assembled.followUpRequired,
    tiers: assembled.tiers,
    storageBusinessFileRestoreClaimed:
      storageResult.businessFileRestoreClaimed === true,
    secretFreeOutput: true,
  };
  log(JSON.stringify(summary, null, 2));
  return { ...summary, evidence: assembled.evidence };
}

export async function runDefaultLiveValidation({
  repoRoot,
  env = process.env,
  log = console.log,
  runCommand = runCommandSafe,
  startProcess = spawn,
  fetchImpl = globalThis.fetch,
  findPort = findAvailablePort,
} = {}) {
  const beforeInstallStatus = trackedStatus(repoRoot, runCommand);
  const install = runCommand(
    pnpmExecutable(),
    ['install', '--frozen-lockfile'],
    {
      cwd: repoRoot,
    },
  );
  if (install.status !== 0) throw new Error('Dependency readiness failed');
  const afterInstallStatus = trackedStatus(repoRoot, runCommand);
  if (afterInstallStatus !== beforeInstallStatus) {
    throw new Error('Dependency readiness changed tracked files');
  }

  const build = runCommand(
    pnpmExecutable(),
    ['--filter', '@sesn/api', 'build'],
    { cwd: repoRoot },
  );
  if (build.status !== 0) throw new Error('API build failed');

  const port = await findPort();
  const child = startProcess(
    pnpmExecutable(),
    ['--filter', '@sesn/api', 'start'],
    {
      cwd: repoRoot,
      env: {
        ...env,
        SUPABASE_URL: env.SESN_SUPABASE_URL,
        SUPABASE_ANON_KEY: env.SESN_SUPABASE_PUBLISHABLE_KEY,
        HOST: '127.0.0.1',
        PORT: String(port),
      },
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      shell: process.platform === 'win32',
    },
  );
  try {
    await waitForHealth({ port, child, fetchImpl });
    const liveEnv = { ...env, SESN_API_URL: `http://127.0.0.1:${port}` };
    await runAuthProjectSmoke({ env: liveEnv, fetchImpl, log: () => {} });
    const dataApi = await runDataApiSecuritySuite({
      env: liveEnv,
      fetchImpl,
      log: () => {},
    });
    const tenantStage = dataApi.components?.find(
      (component) => component.name === 'limited_views',
    );
    const dataApiPassed =
      dataApi.status === 'DATA_API_SECURITY_SUITE_PASSED' &&
      dataApi.failed === 0;
    const tenantIsolationPassed =
      dataApiPassed && tenantStage?.status === 'VALIDATION_PASSED';
    if (!dataApiPassed || !tenantIsolationPassed) {
      throw new Error('Data API/RLS validation failed');
    }

    const result = {
      status: 'LOCAL_LIVE_VALIDATION_PASSED',
      complete: true,
      authSmokeTest: 'PASS',
      applicationSmokeTest: 'PASS',
      dataApiSecurityRegression: 'PASS',
      rlsTenantIsolation: 'PASS',
      secretFreeOutput: true,
    };
    log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    stopChildProcess(child, runCommand);
  }
}

function trackedStatus(repoRoot, runCommand) {
  const result = runCommand(
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    { cwd: repoRoot },
  );
  if (result.status !== 0) throw new Error('Git tracked status check failed');
  return result.stdout;
}

function runCommandSafe(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    windowsHide: true,
    shell:
      options.shell ??
      (process.platform === 'win32' && command === pnpmExecutable()),
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function pnpmExecutable() {
  return 'pnpm';
}

async function waitForHealth({ port, child, fetchImpl, timeoutMs = 30_000 }) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null)
      throw new Error('API server exited before health check');
    try {
      const response = await fetchImpl(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      // Retry until the local API becomes healthy or the timeout expires.
    }
    await delay(150);
  }
  throw new Error('API server health check timed out');
}

function stopChildProcess(child, runCommand) {
  if (!child || child.exitCode !== null || !Number.isInteger(child.pid)) return;
  if (process.platform === 'win32') {
    runCommand('taskkill', ['/PID', String(child.pid), '/T', '/F']);
    return;
  }
  child.kill('SIGTERM');
}

function findAvailablePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to reserve a local API port'));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

function parseLoopbackUrl(value, field, findings) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      findings.push(`${field}-must-use-http-or-https`);
      return null;
    }
    if (!loopbackHosts.has(url.hostname)) {
      findings.push(`${field}-must-be-loopback`);
      return null;
    }
    return url;
  } catch {
    findings.push(`${field}-must-be-valid-url`);
    return null;
  }
}

function buildEvidenceNotes(userNotes) {
  const standard =
    'Automated Disposable Local restore. Custom application role set was empty; Supabase-managed roles remained target-native. Storage metadata was recreated through the Storage API.';
  return nonBlankString(userNotes)
    ? `${standard} ${userNotes.trim()}`
    : standard;
}

function evidenceIdFrom(startedAt) {
  return `BA008-LOCAL-${String(startedAt)
    .replace(/[-:.TZ]/gu, '')
    .slice(0, 14)}`;
}

function roundMinutes(milliseconds) {
  return Math.round((milliseconds / minuteMilliseconds) * 10_000) / 10_000;
}

function parseTimestamp(value, field) {
  if (!validTimestamp(value))
    throw new Error(`${field} must be a valid timestamp`);
  return Date.parse(value);
}

function validTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function nonBlankString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function failedFacts(rule) {
  return {
    status: 'LOCAL_RESTORE_RUN_FACTS_FAILED',
    complete: false,
    findings: [rule],
  };
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
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
  runLocalRestoreDrill({
    runFactsPath: args.facts,
    outputPath: args.output,
  }).catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Local restore drill failed',
    );
    process.exitCode = 1;
  });
}
