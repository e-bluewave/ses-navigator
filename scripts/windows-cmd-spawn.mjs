export function prepareSpawnSyncInvocation({
  command,
  args = [],
  platform = process.platform,
  env = process.env,
} = {}) {
  if (typeof command !== 'string' || command.trim() === '') {
    throw new Error('command is required');
  }
  if (!Array.isArray(args)) throw new Error('args must be an array');

  if (platform === 'win32' && /\.cmd$/iu.test(command)) {
    throw new Error(
      'Windows .cmd execution is prohibited; use a native executable',
    );
  }

  return {
    command,
    args: args.map((value) => String(value)),
    env,
    viaWindowsCmd: false,
  };
}
