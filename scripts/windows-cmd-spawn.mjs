export function prepareSpawnSyncInvocation({
  command,
  args = [],
  platform = process.platform,
  env = process.env,
  envPrefix = 'SESN_CMD_ARG',
} = {}) {
  if (typeof command !== 'string' || command.trim() === '') {
    throw new Error('command is required');
  }
  if (!Array.isArray(args)) throw new Error('args must be an array');

  if (platform !== 'win32' || !/\.cmd$/iu.test(command)) {
    return {
      command,
      args: args.map((value) => String(value)),
      env,
      viaWindowsPowerShell: false,
    };
  }

  const childEnv = { ...env };
  const commandVariable = `${envPrefix}_COMMAND`;
  const countVariable = `${envPrefix}_COUNT`;
  assertSafeVariableName(commandVariable);
  assertSafeVariableName(countVariable);
  assertSafeEnvironmentValue(command);
  childEnv[commandVariable] = command;
  childEnv[countVariable] = String(args.length);

  for (const [index, rawValue] of args.entries()) {
    const value = String(rawValue);
    assertSafeEnvironmentValue(value);
    const variable = `${envPrefix}_${index}`;
    assertSafeVariableName(variable);
    childEnv[variable] = value;
  }

  // cmd.exe reparses shell metacharacters such as '&' after environment
  // expansion, even when the original value was supplied as one logical argv.
  // PostgreSQL URLs commonly contain percent-encoding and query separators, so
  // route .cmd execution through PowerShell's call operator instead. The actual
  // command and argv stay in child environment variables and are never embedded
  // in the PowerShell command text or process command line.
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$command = [Environment]::GetEnvironmentVariable('${commandVariable}')`,
    `$count = [int][Environment]::GetEnvironmentVariable('${countVariable}')`,
    '$arguments = @()',
    'for ($i = 0; $i -lt $count; $i++) {',
    `  $arguments += [Environment]::GetEnvironmentVariable(('${envPrefix}_{0}' -f $i))`,
    '}',
    '& $command @arguments',
    '$code = $LASTEXITCODE',
    'if ($null -eq $code) { $code = 0 }',
    'exit [int]$code',
  ].join('\r\n');

  return {
    command: 'powershell.exe',
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ],
    env: childEnv,
    viaWindowsPowerShell: true,
  };
}

function assertSafeVariableName(value) {
  if (!/^[A-Z0-9_]+$/u.test(value)) {
    throw new Error('Windows command environment variable name is invalid');
  }
}

function assertSafeEnvironmentValue(value) {
  if (value.includes('\0') || value.includes('\r') || value.includes('\n')) {
    throw new Error('Windows command argument contains a prohibited character');
  }
}
