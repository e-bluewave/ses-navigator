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
      viaWindowsCmd: false,
    };
  }

  const childEnv = { ...env };
  const commandVariable = `${envPrefix}_COMMAND`;
  assertSafeVariableName(commandVariable);
  assertSafeEnvironmentValue(command);
  childEnv[commandVariable] = command;

  const argumentReferences = [];
  for (const [index, rawValue] of args.entries()) {
    const value = String(rawValue);
    assertSafeEnvironmentValue(value);
    const variable = `${envPrefix}_${index}`;
    assertSafeVariableName(variable);
    childEnv[variable] = value;
    argumentReferences.push(`"%${variable}%"`);
  }

  const commandLine = [
    'call',
    `"%${commandVariable}%"`,
    ...argumentReferences,
  ].join(' ');

  return {
    command: env.ComSpec || env.COMSPEC || 'cmd.exe',
    args: ['/d', '/s', '/c', commandLine],
    env: childEnv,
    viaWindowsCmd: true,
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
