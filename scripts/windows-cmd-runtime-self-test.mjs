import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareSpawnSyncInvocation } from './windows-cmd-spawn.mjs';

if (process.platform !== 'win32') {
  console.log(
    JSON.stringify(
      {
        status: 'WINDOWS_CMD_RUNTIME_NOT_APPLICABLE',
        complete: true,
        platform: process.platform,
        secretFreeOutput: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const root = mkdtempSync(join(tmpdir(), 'SESN Windows CMD '));
const batchPath = join(root, 'argument-echo.cmd');
const outputPath = join(root, 'argv.json');
const expected = [
  'alpha',
  'postgresql://user:p%40ss%26word@example.invalid:5432/postgres?x=a&y=b',
  'C:\\Backup Files\\roles.sql',
];

let failureStage = 'setup';
let processExitCode = null;
let spawnErrorCode = null;
let outputCreated = false;
let safeStderr = '';

try {
  const batch = [
    '@echo off',
    'node -e "require(\'node:fs\').writeFileSync(process.env.SESN_WINDOWS_CMD_SELFTEST_OUT, JSON.stringify(process.argv.slice(1)))" %*',
    '',
  ].join('\r\n');
  writeFileSync(batchPath, batch, 'ascii');

  const baseEnv = {
    ...process.env,
    SESN_WINDOWS_CMD_SELFTEST_OUT: outputPath,
  };
  const invocation = prepareSpawnSyncInvocation({
    command: batchPath,
    args: expected,
    platform: 'win32',
    env: baseEnv,
    envPrefix: 'SESN_WINDOWS_CMD_SELFTEST',
  });

  failureStage = 'spawn';
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: invocation.env,
  });
  processExitCode = typeof result.status === 'number' ? result.status : 1;
  spawnErrorCode =
    result.error && typeof result.error.code === 'string'
      ? result.error.code
      : null;
  outputCreated = existsSync(outputPath);
  safeStderr = String(result.stderr ?? '')
    .replaceAll(root, '<TEMP>')
    .replaceAll(expected[1], '<SYNTHETIC_URL>')
    .slice(0, 500)
    .trim();

  if (!outputCreated) {
    throw new Error('self-test-output-not-created');
  }

  failureStage = 'parse';
  const actual = JSON.parse(readFileSync(outputPath, 'utf8'));
  const exactArgumentParity =
    JSON.stringify(actual) === JSON.stringify(expected);
  const complete = processExitCode === 0 && exactArgumentParity;

  console.log(
    JSON.stringify(
      {
        status: complete
          ? 'WINDOWS_CMD_RUNTIME_PASSED'
          : 'WINDOWS_CMD_RUNTIME_FAILED',
        complete,
        processExitCode,
        spawnErrorCode,
        outputCreated,
        exactArgumentParity,
        percentEncodedArgumentPreserved: actual[1] === expected[1],
        spacedPathArgumentPreserved: actual[2] === expected[2],
        secretFreeOutput: true,
      },
      null,
      2,
    ),
  );

  if (!complete) process.exitCode = 1;
} catch (error) {
  console.log(
    JSON.stringify(
      {
        status: 'WINDOWS_CMD_RUNTIME_FAILED',
        complete: false,
        failureStage,
        failureCode:
          error instanceof Error ? error.message : 'unknown-self-test-failure',
        processExitCode,
        spawnErrorCode,
        outputCreated,
        stderrSummary: safeStderr || null,
        secretFreeOutput: true,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  rmSync(root, { recursive: true, force: true });
}
