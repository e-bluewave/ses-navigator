import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isMainModule } from './cli-entry.mjs';

const writePrivileges = [
  'delete',
  'insert',
  'references',
  'trigger',
  'truncate',
  'update',
];

export const expectedAuthenticatedWrites = {
  'app.comment_links': ['insert', 'update'],
  'app.comments': ['insert', 'update'],
  'app.companies': ['insert', 'update'],
  'app.company_contacts': ['insert', 'update'],
  'app.engineers': ['insert', 'update'],
  'app.notification_recipients': ['update'],
  'app.projects': ['insert', 'update'],
  'app.saved_searches': ['insert', 'update'],
  'app.tag_links': ['insert', 'update'],
  'app.tags': ['insert', 'update'],
};

export function validateDataApiWriteSurface(files) {
  const state = new Map();
  for (const file of files) applySql(state, file.source, file.name);

  const authenticated = roleWrites(state, 'authenticated');
  const anonymous = roleWrites(state, 'anon');
  const servicePublic = Object.fromEntries(
    Object.entries(roleWrites(state, 'service_role')).filter(([relation]) =>
      relation.startsWith('public.'),
    ),
  );
  const failures = [];

  compareManifest(
    failures,
    'authenticated direct writes',
    authenticated,
    expectedAuthenticatedWrites,
  );
  if (Object.keys(anonymous).length > 0) {
    failures.push('anon must not have direct table write privileges');
  }
  if (Object.keys(servicePublic).length > 0) {
    failures.push(
      'service_role must not have direct writes on public relations',
    );
  }

  return {
    status:
      failures.length === 0
        ? 'DATA_API_WRITE_SURFACE_PASSED'
        : 'DATA_API_WRITE_SURFACE_FAILED',
    authenticatedWrites: authenticated,
    anonymousWrites: anonymous,
    serviceRolePublicWrites: servicePublic,
    failures,
  };
}

export async function runDataApiWriteSurfaceCheck({
  migrationsPath = 'supabase/migrations',
  log = console.log,
} = {}) {
  const names = (await readdir(migrationsPath))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const files = await Promise.all(
    names.map(async (name) => ({
      name,
      source: await readFile(join(migrationsPath, name), 'utf8'),
    })),
  );
  const result = validateDataApiWriteSurface(files);
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(
      `Data API write surface guard failed (${result.failures.length})`,
    );
  }
  return result;
}

function applySql(state, source, fileName) {
  const pattern =
    /\b(grant|revoke)\s+([^;]*?)\s+on\s+table\s+([^;]*?)\s+(to|from)\s+([^;]+);/gi;
  for (const match of source.matchAll(pattern)) {
    const operation = match[1].toLowerCase();
    const privileges = normalizePrivileges(match[2]);
    const relations = match[3]
      .split(',')
      .map(normalizeIdentifier)
      .filter(Boolean);
    const roles = match[5]
      .split(',')
      .map(normalizeIdentifier)
      .filter((role) =>
        ['anon', 'authenticated', 'service_role'].includes(role),
      );
    for (const role of roles) {
      for (const relation of relations) {
        const key = `${role}:${relation}`;
        const current = state.get(key) ?? {
          role,
          relation,
          privileges: new Set(),
          source: fileName,
        };
        current.source = fileName;
        if (operation === 'grant') {
          for (const privilege of privileges) current.privileges.add(privilege);
        } else if (/\ball\b/i.test(match[2])) {
          current.privileges.clear();
        } else {
          for (const privilege of privileges)
            current.privileges.delete(privilege);
        }
        state.set(key, current);
      }
    }
  }
}

function normalizePrivileges(value) {
  if (/\ball\b/i.test(value)) return writePrivileges;
  return value
    .split(',')
    .map((privilege) => privilege.trim().toLowerCase())
    .filter((privilege) => writePrivileges.includes(privilege));
}

function normalizeIdentifier(value) {
  return value
    .replace(/--[^\n]*/g, '')
    .replace(/\b(public|anon|authenticated|service_role)\b/i, (name) =>
      name.toLowerCase(),
    )
    .replace(/\s+/g, '')
    .replace(/^only/i, '')
    .replaceAll('"', '')
    .toLowerCase();
}

function roleWrites(state, role) {
  return Object.fromEntries(
    [...state.values()]
      .filter((entry) => entry.role === role && entry.privileges.size > 0)
      .sort((left, right) => left.relation.localeCompare(right.relation))
      .map((entry) => [entry.relation, [...entry.privileges].sort()]),
  );
}

function compareManifest(failures, label, actual, expected) {
  const actualJson = JSON.stringify(sortManifest(actual));
  const expectedJson = JSON.stringify(sortManifest(expected));
  if (actualJson !== expectedJson) {
    failures.push(`${label} do not match the reviewed manifest`);
  }
}

function sortManifest(value) {
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, privileges]) => [key, [...privileges].sort()]),
  );
}

if (isMainModule(import.meta.url)) {
  runDataApiWriteSurfaceCheck().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Write surface check failed',
    );
    process.exitCode = 1;
  });
}
