import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isMainModule } from './cli-entry.mjs';

const trackedRoles = ['public', 'anon', 'authenticated', 'service_role'];

export const reviewedDormantAuthenticatedRpcs = [
  'get_ai_execution_output',
  'get_audit_event_detail',
];

export const expectedServiceRoleRpcs = ['service_get_sensitive_record'];

export function extractApiRpcNames(files) {
  const names = new Set();
  for (const file of files) {
    for (const match of file.source.matchAll(/\/rpc\/([a-z0-9_]+)/g)) {
      names.add(match[1]);
    }
    for (const match of file.source.matchAll(
      /\brpc\(\s*[^,]+,\s*['"]([a-z0-9_]+)['"]/g,
    )) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
}

export function reconstructPublicFunctionGrants(files) {
  const state = new Map(trackedRoles.map((role) => [role, new Set()]));
  for (const file of files) applySql(state, file.source);
  return Object.fromEntries(
    trackedRoles.map((role) => [role, [...state.get(role)].sort()]),
  );
}

export function validateDataApiRpcSurface({ apiFiles, migrationFiles }) {
  const apiRpcs = extractApiRpcNames(apiFiles);
  const grants = reconstructPublicFunctionGrants(migrationFiles);
  const expectedAuthenticated = [
    ...new Set([...apiRpcs, ...reviewedDormantAuthenticatedRpcs]),
  ].sort();
  const failures = [];

  compareSet(
    failures,
    'authenticated public RPCs',
    grants.authenticated,
    expectedAuthenticated,
  );
  compareSet(
    failures,
    'service_role public RPCs',
    grants.service_role,
    expectedServiceRoleRpcs,
  );
  if (grants.anon.length > 0)
    failures.push('anon must not execute public RPCs');
  if (grants.public.length > 0)
    failures.push('PUBLIC must not execute public RPCs');

  return {
    status:
      failures.length === 0
        ? 'DATA_API_RPC_SURFACE_PASSED'
        : 'DATA_API_RPC_SURFACE_FAILED',
    apiRpcCount: apiRpcs.length,
    authenticatedRpcCount: grants.authenticated.length,
    serviceRoleRpcCount: grants.service_role.length,
    apiRpcs,
    reviewedDormantAuthenticatedRpcs,
    grants,
    failures,
  };
}

export async function runDataApiRpcSurfaceCheck({
  apiPath = 'apps/api/src',
  migrationsPath = 'supabase/migrations',
  log = console.log,
} = {}) {
  const [apiFiles, migrationFiles] = await Promise.all([
    readTree(apiPath, '.ts'),
    readTree(migrationsPath, '.sql'),
  ]);
  const result = validateDataApiRpcSurface({ apiFiles, migrationFiles });
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(
      `Data API RPC surface guard failed (${result.failures.length})`,
    );
  }
  return result;
}

async function readTree(root, extension) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith(extension)) {
        files.push({ name: path, source: await readFile(path, 'utf8') });
      }
    }
  }
  await visit(root);
  return files;
}

function applySql(state, source) {
  const events = [];
  const clearPattern =
    /\brevoke\s+(?:all|execute)\s+on\s+all\s+functions\s+in\s+schema\s+public\s+from\s+([^;]+);/gi;
  for (const match of source.matchAll(clearPattern)) {
    events.push({ index: match.index, type: 'clear', roles: roles(match[1]) });
  }

  const functionPattern =
    /\b(grant|revoke)\s+(?:all|execute)\s+on\s+function\s+([\s\S]*?)\s+(to|from)\s+([^;]+);/gi;
  for (const match of source.matchAll(functionPattern)) {
    events.push({
      index: match.index,
      type: match[1].toLowerCase(),
      names: [...match[2].matchAll(/\bpublic\.([a-z0-9_]+)\s*\(/gi)].map(
        (name) => name[1].toLowerCase(),
      ),
      roles: roles(match[4]),
    });
  }

  for (const event of events.sort((left, right) => left.index - right.index)) {
    for (const role of event.roles) {
      if (event.type === 'clear') state.get(role).clear();
      else {
        for (const name of event.names) {
          if (event.type === 'grant') state.get(role).add(name);
          else state.get(role).delete(name);
        }
      }
    }
  }
}

function roles(value) {
  return value
    .split(',')
    .map((role) => role.replaceAll('"', '').trim().toLowerCase())
    .filter((role) => trackedRoles.includes(role));
}

function compareSet(failures, label, actual, expected) {
  const missing = expected.filter((name) => !actual.includes(name));
  const excess = actual.filter((name) => !expected.includes(name));
  if (missing.length > 0)
    failures.push(`${label} missing: ${missing.join(', ')}`);
  if (excess.length > 0) failures.push(`${label} excess: ${excess.join(', ')}`);
}

if (isMainModule(import.meta.url)) {
  runDataApiRpcSurfaceCheck().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'RPC surface check failed',
    );
    process.exitCode = 1;
  });
}
