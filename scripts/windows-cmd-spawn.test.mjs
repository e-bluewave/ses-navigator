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

test('Windows .cmd invocation avoids CALL and keeps percent-encoded arguments out of command text', () => {
  const secretUrl =
    'postgresql://user:p%40ss%26word@example.invalid:5432/postgres?x=a&y=b';
  const result = prepareSpawnSyncInvocation({
    command: 'supabase.cmd',
    args: [
      'db',
      'dump',
      '--db-url',
      secretUrl,
      '-f',
      'C:\\Backup Files\\roles.sql',
    ],
    platform: 'win32',
    env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
    envPrefix: 'SESN_DB_CAPTURE',
  });

  assert.equal(result.command, 'C:\\Windows\\System32\\cmd.exe');
  assert.equal(result.viaWindowsCmd, true);
  assert.deepEqual(result.args.slice(0, 3), ['/d', '/s', '/c']);
  const commandLine = result.args[3];
  assert.equal(commandLine.startsWith('call '), false);
  assert.match(commandLine, /^"%SESN_DB_CAPTURE_COMMAND%"/u);
  assert.equal(commandLine.includes(secretUrl), false);
  assert.equal(commandLine.includes('C:\\Backup Files\\roles.sql'), false);
  assert.equal(result.env.SESN_DB_CAPTURE_COMMAND, 'supabase.cmd');
  assert.equal(result.env.SESN_DB_CAPTURE_3, secretUrl);
  assert.equal(result.env.SESN_DB_CAPTURE_5, 'C:\\Backup Files\\roles.sql');
});

test('Windows command text contains only environment references for argv values', () => {
  const result = prepareSpawnSyncInvocation({
    command: 'tool.cmd',
    args: ['one', 'p%40ss', 'a&b', 'x|y', '<z>'],
    platform: 'win32',
    env: { COMSPEC: 'cmd.exe' },
    envPrefix: 'SESN_TEST',
  });

  assert.equal(
    result.args[3],
    '"%SESN_TEST_COMMAND%" "%SESN_TEST_0%" "%SESN_TEST_1%" "%SESN_TEST_2%" "%SESN_TEST_3%" "%SESN_TEST_4%"',
  );
  assert.equal(result.args[3].includes('p%40ss'), false);
  assert.equal(result.args[3].includes('a&b'), false);
});

test('Windows native executable does not require cmd.exe', () => {
  const result = prepareSpawnSyncInvocation({
    command: 'supabase.exe',
    args: ['--version'],
    platform: 'win32',
    env: {},
  });
  assert.equal(result.command, 'supabase.exe');
  assert.equal(result.viaWindowsCmd, false);
});

test('rejects newline-bearing Windows command arguments', () => {
  assert.throws(
    () =>
      prepareSpawnSyncInvocation({
        command: 'supabase.cmd',
        args: ['ok', 'bad\r\narg'],
        platform: 'win32',
        env: {},
      }),
    /prohibited character/u,
  );
});
