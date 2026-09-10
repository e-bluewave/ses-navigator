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
  assert.equal(result.viaWindowsPowerShell, false);
});

test('Windows .cmd invocation uses PowerShell bridge without embedding sensitive argv', () => {
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
    env: {},
    envPrefix: 'SESN_DB_CAPTURE',
  });

  assert.equal(result.command, 'powershell.exe');
  assert.equal(result.viaWindowsPowerShell, true);
  assert.equal(result.args.includes('-EncodedCommand'), true);
  assert.equal(result.args.join(' ').includes(secretUrl), false);
  assert.equal(result.args.join(' ').includes('C:\\Backup Files\\roles.sql'), false);
  assert.equal(result.env.SESN_DB_CAPTURE_COMMAND, 'supabase.cmd');
  assert.equal(result.env.SESN_DB_CAPTURE_COUNT, '6');
  assert.equal(result.env.SESN_DB_CAPTURE_3, secretUrl);
  assert.equal(result.env.SESN_DB_CAPTURE_5, 'C:\\Backup Files\\roles.sql');

  const encoded = result.args.at(-1);
  const script = Buffer.from(encoded, 'base64').toString('utf16le');
  assert.match(script, /& \$command @arguments/u);
  assert.match(script, /SESN_DB_CAPTURE_COMMAND/u);
  assert.equal(script.includes(secretUrl), false);
  assert.equal(script.includes('C:\\Backup Files\\roles.sql'), false);
});

test('PowerShell bridge keeps shell-sensitive values only in child environment', () => {
  const values = ['one', 'p%40ss', 'a&b', 'x|y', '<z>', 'quoted value'];
  const result = prepareSpawnSyncInvocation({
    command: 'tool.cmd',
    args: values,
    platform: 'win32',
    env: {},
    envPrefix: 'SESN_TEST',
  });

  const encoded = result.args.at(-1);
  const script = Buffer.from(encoded, 'base64').toString('utf16le');
  for (const value of values) {
    assert.equal(result.args.join(' ').includes(value), false);
    assert.equal(script.includes(value), false);
  }
  assert.equal(result.env.SESN_TEST_COUNT, String(values.length));
  assert.equal(result.env.SESN_TEST_1, 'p%40ss');
  assert.equal(result.env.SESN_TEST_2, 'a&b');
});

test('Windows native executable does not require PowerShell bridge', () => {
  const result = prepareSpawnSyncInvocation({
    command: 'supabase.exe',
    args: ['--version'],
    platform: 'win32',
    env: {},
  });
  assert.equal(result.command, 'supabase.exe');
  assert.equal(result.viaWindowsPowerShell, false);
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
