import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareSpawnSyncInvocation } from './windows-cmd-spawn.mjs';

test('non-Windows invocation preserves executable and argv', () => {
  const env = { TEST: '1' };
  const result = prepareSpawnSyncInvocation({
    command: 'supabase',
    args: ['db', 'dump'],
    platform: 'linux',
    env,
  });
  assert.equal(result.command, 'supabase');
  assert.deepEqual(result.args, ['db', 'dump']);
  assert.equal(result.env, env);
  assert.equal(result.viaWindowsCmd, false);
});

test('Windows native executable preserves shell-sensitive argv without shell routing', () => {
  const env = { TEST: '1' };
  const values = [
    'db',
    'dump',
    '--db-url',
    'postgresql://user:p%40ss%26word@example.invalid:5432/postgres?x=a&y=b',
    '-f',
    'C:\\Backup Files\\roles.sql',
  ];
  const result = prepareSpawnSyncInvocation({
    command: 'supabase.exe',
    args: values,
    platform: 'win32',
    env,
  });

  assert.equal(result.command, 'supabase.exe');
  assert.deepEqual(result.args, values);
  assert.equal(result.env, env);
  assert.equal(result.viaWindowsCmd, false);
});

test('Windows cmd execution is rejected fail-closed', () => {
  assert.throws(
    () =>
      prepareSpawnSyncInvocation({
        command: 'supabase.cmd',
        args: [
          'db',
          'dump',
          '--db-url',
          'postgresql://user:p%40ss@example.invalid/postgres?x=a&y=b',
        ],
        platform: 'win32',
        env: {},
      }),
    /native executable/u,
  );
});

test('native executable normalizes argv values to strings', () => {
  const result = prepareSpawnSyncInvocation({
    command: 'tool.exe',
    args: ['one', 2, true],
    platform: 'win32',
    env: {},
  });
  assert.deepEqual(result.args, ['one', '2', 'true']);
});
