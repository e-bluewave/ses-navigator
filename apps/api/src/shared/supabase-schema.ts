const publicRpcPrefix = '/rpc/';

export function dataApiSchemaHeaders(path: string) {
  const schema = path.startsWith(publicRpcPrefix) ? 'public' : 'app';
  return {
    'accept-profile': schema,
    'content-profile': schema,
  } as const;
}
