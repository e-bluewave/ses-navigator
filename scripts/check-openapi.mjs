import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

const contract = await readFile(
  new URL('../openapi/sesn.v1.yaml', import.meta.url),
  'utf8',
);
for (const required of [
  'openapi: 3.1.0',
  'operationId: listProjects',
  'operationId: getProject',
  "'401'",
  "'403'",
  "'404'",
]) {
  if (!contract.includes(required))
    throw new Error(`OpenAPI contract is missing: ${required}`);
}
