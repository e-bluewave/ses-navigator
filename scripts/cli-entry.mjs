import { pathToFileURL } from 'node:url';

export function isMainModule(
  moduleUrl,
  entryPath = process.argv[1],
  toFileUrl = pathToFileURL,
) {
  return (
    typeof entryPath === 'string' && moduleUrl === toFileUrl(entryPath).href
  );
}
