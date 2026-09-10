import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: invocation.env,
  });

  const actual = JSON.parse(readFileSync(outputPath, 'utf8'));
  const exactArgumentParity =
    JSON.stringify(actual) === JSON.stringify(expected);
  const complete = result.status === 0 && exactArgumentParity;

  console.log(
    JSON.stringify(
      {
        status: complete
          ? 'WINDOWS_CMD_RUNTIME_PASSED'
          : 'WINDOWS_CMD_RUNTIME_FAILED',
        complete,
        processExitCode: typeof result.status === 'number' ? result.status : 1,
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
} catch {
  console.log(
    JSON.stringify(
      {
        status: 'WINDOWS_CMD_RUNTIME_FAILED',
        complete: false,
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
