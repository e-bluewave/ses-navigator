import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export function validateDataApiSchemaRouting(files) {
  const requestFiles = files.filter((file) => file.source.includes('/rest/v1'));
  const missingImport = requestFiles
    .filter(
      (file) => !file.source.includes("from '../../shared/supabase-schema.js'"),
    )
    .map((file) => file.name)
    .sort();
  const missingRouting = requestFiles
    .filter((file) => !file.source.includes('dataApiSchemaHeaders('))
    .map((file) => file.name)
    .sort();
  const failures = [];

  if (missingImport.length > 0) {
    failures.push(`schema header import missing: ${missingImport.join(', ')}`);
  }
  if (missingRouting.length > 0) {
    failures.push(
      `schema header routing missing: ${missingRouting.join(', ')}`,
    );
  }

  return {
    status:
      failures.length === 0
        ? 'DATA_API_SCHEMA_ROUTING_PASSED'
        : 'DATA_API_SCHEMA_ROUTING_FAILED',
    requestFileCount: requestFiles.length,
    missingImport,
    missingRouting,
    failures,
  };
}

export async function runDataApiSchemaRoutingCheck({
  apiPath = 'apps/api/src',
  log = console.log,
} = {}) {
  const files = await readTree(apiPath);
  const result = validateDataApiSchemaRouting(files);
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(
      `Data API schema routing guard failed (${result.failures.length})`,
    );
  }
  return result;
}

async function readTree(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith('.ts')) {
        files.push({ name: path, source: await readFile(path, 'utf8') });
      }
    }
  }
  await visit(root);
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDataApiSchemaRoutingCheck().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Schema routing check failed',
    );
    process.exitCode = 1;
  });
}
