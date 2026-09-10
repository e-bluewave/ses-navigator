import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isMainModule } from './cli-entry.mjs';
import {
  runDefaultLiveValidation,
  runLocalRestoreDrill,
} from './restore-drill-local-run.mjs';

const setupRelativePath = 'supabase/tests/data_api/02_setup.sql';
const cleanupRelativePath = 'supabase/tests/data_api/05_cleanup.sql';
const userAPlaceholder = 'replace-user-a@example.invalid';
const userBPlaceholder = 'replace-user-b@example.invalid';
const setupReadyMarker = 'READY_FOR_VALIDATION';
const cleanupPassedMarker = 'CLEANUP_PASSED';

export function buildAuthAdminHeaders(secretKey) {
  if (typeof secretKey !== 'string' || secretKey.trim() === '') {
    throw new Error('Local Supabase secret key is required');
  }
  if (secretKey.startsWith('sb_secret_')) {
    return { apikey: secretKey, 'content-type': 'application/json' };
  }
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    'content-type': 'application/json',
  };
}

export function buildValidationSetupSql(template, { userAEmail, userBEmail }) {
  if (typeof template !== 'string' || template.trim() === '') {
    throw new Error('Validation setup SQL is required');
  }
  assertGeneratedEmail(userAEmail, 'User A');
  assertGeneratedEmail(userBEmail, 'User B');
  if (userAEmail === userBEmail) {
    throw new Error('Validation users must be different');
  }
  if (countLiteral(template, userAPlaceholder) !== 1) {
    throw new Error('User A validation placeholder must occur exactly once');
  }
  if (countLiteral(template, userBPlaceholder) !== 1) {
    throw new Error('User B validation placeholder must occur exactly once');
  }
  return template
    .replace(userAPlaceholder, userAEmail)
    .replace(userBPlaceholder, userBEmail);
}

export function generateValidationCredentials(randomBytesImpl = randomBytes) {
  const suffix = randomBytesImpl(10).toString('hex');
  const password = `L0cal!BA008-${randomBytesImpl(18).toString('base64url')}`;
  return {
    userAEmail: `ba008-a-${suffix}@example.test`,
    userBEmail: `ba008-b-${suffix}@example.test`,
    password,
  };
}

export function createAuthAdminClient({
  baseUrl,
  secretKey,
  fetchImpl = fetch,
}) {
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    throw new Error('Local Supabase URL is required');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch implementation is required');
  }
  const normalizedBaseUrl = baseUrl.replace(/\/+$/u, '');
  const headers = buildAuthAdminHeaders(secretKey);

  return {
    async createUser(email, password) {
      assertGeneratedEmail(email, 'Validation');
      if (typeof password !== 'string' || password.length < 16) {
        throw new Error('Generated validation password is invalid');
      }
      const response = await fetchImpl(
        `${normalizedBaseUrl}/auth/v1/admin/users`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            email,
            password,
            email_confirm: true,
          }),
        },
      );
      const body = await readJson(response);
      const id =
        typeof body.id === 'string'
          ? body.id
          : typeof body.user?.id === 'string'
            ? body.user.id
            : null;
      if (!response.ok || !id) {
        throw new Error(
          `Local Auth user creation failed (HTTP ${response.status})`,
        );
      }
      return id;
    },

    async deleteUser(id) {
      if (typeof id !== 'string' || id.trim() === '') return;
      const response = await fetchImpl(
        `${normalizedBaseUrl}/auth/v1/admin/users/${encodeURIComponent(id)}`,
        { method: 'DELETE', headers },
      );
      if (!response.ok && response.status !== 404) {
        throw new Error(
          `Local Auth user cleanup failed (HTTP ${response.status})`,
        );
      }
    },
  };
}

export function parseSupabaseStatusEnvironment(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('Local Supabase status output is required');
  }
  const values = {};
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\s*([A-Z0-9_]+)\s*=(.*)$/u.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  for (const name of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']) {
    if (typeof values[name] !== 'string' || values[name].trim() === '') {
      throw new Error(`Local Supabase status missing ${name}`);
    }
  }
  return values;
}

export function buildRuntimeEnvironmentFromStatus(statusText, baseEnv = {}) {
  const values = parseSupabaseStatusEnvironment(statusText);
  return {
    ...baseEnv,
    SESN_RESTORE_STORAGE_URL: values.API_URL,
    SESN_RESTORE_STORAGE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY,
    SESN_SUPABASE_URL: values.API_URL,
    SESN_SUPABASE_PUBLISHABLE_KEY: values.ANON_KEY,
    SESN_SUPABASE_SECRET_KEY: values.SERVICE_ROLE_KEY,
  };
}

export function defaultSupabaseExecutable(platform = process.platform) {
  return platform === 'win32' ? 'supabase.exe' : 'supabase';
}

export async function runLocalRestoreDrillWithFixture({
  runFactsPath,
  outputPath,
  supabaseWorkdir,
  env = process.env,
  readFileImpl = readFile,
  runRestoreDrill = runLocalRestoreDrill,
  runLiveValidation = runDefaultLiveValidation,
  createAdminClient = createAuthAdminClient,
  runPsql = runPsqlSafe,
  generateCredentials = generateValidationCredentials,
  supabaseExecutable = defaultSupabaseExecutable(),
  runSupabaseStatus = runSupabaseStatusSafe,
  log = console.log,
} = {}) {
  if (!runFactsPath) throw new Error('Private run facts path is required');
  if (!outputPath)
    throw new Error('Restore drill evidence output path is required');

  const factsText = await readFileImpl(runFactsPath, 'utf8');
  if (factsText.charCodeAt(0) === 0xfeff) {
    throw new Error('Private run facts must be UTF-8 without BOM');
  }
  const facts = JSON.parse(factsText);
  const repoRoot = resolve(facts.repoRoot ?? '.');
  const containerName = facts.db?.containerName;
  const requiredNameToken = facts.db?.requiredNameToken;
  if (
    typeof containerName !== 'string' ||
    typeof requiredNameToken !== 'string' ||
    requiredNameToken.length < 4 ||
    !containerName.includes(requiredNameToken)
  ) {
    throw new Error('Disposable restore container identity failed');
  }

  const [setupTemplate, cleanupSql] = await Promise.all([
    readFileImpl(resolve(repoRoot, setupRelativePath), 'utf8'),
    readFileImpl(resolve(repoRoot, cleanupRelativePath), 'utf8'),
  ]);
  if (
    setupTemplate.charCodeAt(0) === 0xfeff ||
    cleanupSql.charCodeAt(0) === 0xfeff
  ) {
    throw new Error('Validation SQL must be UTF-8 without BOM');
  }

  let runtimeEnv = { ...env };
  if (supabaseWorkdir) {
    const statusText = await runSupabaseStatus({
      workdir: supabaseWorkdir,
      supabaseExecutable,
    });
    runtimeEnv = buildRuntimeEnvironmentFromStatus(statusText, runtimeEnv);
  }

  const credentials = generateCredentials();
  const setupSql = buildValidationSetupSql(setupTemplate, credentials);
  const runEnv = {
    ...runtimeEnv,
    SESN_TEST_EMAIL: credentials.userAEmail,
    SESN_TEST_PASSWORD: credentials.password,
    SESN_TEST_USER_A_EMAIL: credentials.userAEmail,
    SESN_TEST_USER_A_PASSWORD: credentials.password,
    SESN_TEST_USER_B_EMAIL: credentials.userBEmail,
    SESN_TEST_USER_B_PASSWORD: credentials.password,
  };
  const adminClient = createAdminClient({
    baseUrl: runEnv.SESN_SUPABASE_URL,
    secretKey: runEnv.SESN_SUPABASE_SECRET_KEY,
  });

  let userAId = null;
  let userBId = null;
  let fixtureSetupApplied = false;
  let fixtureReady = false;
  let primaryError = null;
  let cleanupError = null;
  let result = null;

  const liveValidationWithFixture = async ({
    repoRoot: liveRepoRoot,
    env: liveEnv,
  }) => {
    userAId = await adminClient.createUser(
      credentials.userAEmail,
      credentials.password,
    );
    userBId = await adminClient.createUser(
      credentials.userBEmail,
      credentials.password,
    );
    log(
      JSON.stringify({
        status: 'LOCAL_AUTH_VALIDATION_USERS_READY',
        userCount: 2,
        secretFreeOutput: true,
      }),
    );

    const setupOutput = await runPsql({ containerName, sql: setupSql });
    fixtureSetupApplied = true;
    if (!setupOutput.includes(setupReadyMarker)) {
      throw new Error('Validation fixture readiness marker missing');
    }
    fixtureReady = true;
    log(
      JSON.stringify({
        status: 'LOCAL_DATA_API_FIXTURE_READY',
        secretFreeOutput: true,
      }),
    );

    return runLiveValidation({
      repoRoot: liveRepoRoot,
      env: liveEnv,
      log: () => {},
    });
  };

  try {
    result = await runRestoreDrill({
      runFactsPath,
      outputPath,
      env: runEnv,
      runLiveValidation: liveValidationWithFixture,
      log: () => {},
    });
  } catch (error) {
    primaryError = error;
  } finally {
    let fixtureCleanupPassed = false;

    if (fixtureSetupApplied) {
      try {
        const cleanupOutput = await runPsql({ containerName, sql: cleanupSql });
        if (!cleanupOutput.includes(cleanupPassedMarker)) {
          cleanupError = new Error('Validation fixture cleanup marker missing');
        } else {
          fixtureCleanupPassed = true;
        }
      } catch (error) {
        cleanupError = error;
      }
    }

    if (!fixtureReady || fixtureCleanupPassed) {
      for (const id of [userBId, userAId]) {
        try {
          await adminClient.deleteUser(id);
        } catch (error) {
          cleanupError ??= error;
        }
      }
    }

    if (fixtureCleanupPassed) {
      log(
        JSON.stringify({
          status: 'LOCAL_DATA_API_FIXTURE_CLEANUP_PASSED',
          validationResidueExpected: false,
          secretFreeOutput: true,
        }),
      );
    }
  }

  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;

  if (result?.status !== 'LOCAL_RESTORE_DRILL_PASSED') {
    throw new Error('Local restore drill did not pass');
  }

  const summary = {
    status: 'LOCAL_RESTORE_DRILL_PASSED',
    restoreDrillEvidence: result.restoreDrillEvidence,
    rpoMinutes: result.rpoMinutes,
    rtoMinutes: result.rtoMinutes,
    followUpRequired: result.followUpRequired,
    tiers: result.tiers,
    storageBusinessFileRestoreClaimed:
      result.storageBusinessFileRestoreClaimed === true,
    validationFixtureLifecycle: 'PASS',
    secretFreeOutput: true,
  };
  log(JSON.stringify(summary, null, 2));
  return { ...result, validationFixtureLifecycle: 'PASS' };
}

async function runSupabaseStatusSafe({ workdir, supabaseExecutable }) {
  if (typeof workdir !== 'string' || workdir.trim() === '') {
    throw new Error('Local Supabase workdir is required');
  }
  const result = spawnSync(
    supabaseExecutable,
    ['status', '--workdir', workdir, '-o', 'env'],
    {
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if ((result.status ?? 1) !== 0) {
    throw new Error('Local Supabase status failed');
  }
  return result.stdout ?? '';
}

async function runPsqlSafe({ containerName, sql }) {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      containerName,
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
      '-f',
      '-',
    ],
    {
      input: sql,
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  if ((result.status ?? 1) !== 0) {
    throw new Error('Validation fixture SQL failed');
  }
  return result.stdout ?? '';
}

function assertGeneratedEmail(value, label) {
  if (
    typeof value !== 'string' ||
    !/^ba008-[ab]-[0-9a-f]+@example\.test$/u.test(value)
  ) {
    throw new Error(`${label} validation email is invalid`);
  }
}

function countLiteral(text, value) {
  return text.split(value).length - 1;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
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
  runLocalRestoreDrillWithFixture({
    runFactsPath: args.facts,
    outputPath: args.output,
    supabaseWorkdir: args['supabase-workdir'],
  }).catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Local restore drill with validation fixture failed',
    );
    process.exitCode = 1;
  });
}
