import { readFile } from 'node:fs/promises';

const allowedSchemas = ['app', 'graphql_public', 'public'];
const allowedSearchPath = ['extensions', 'public'];
const forbiddenSchemas = ['audit', 'integration', 'private', 'storage'];

export function validateSupabaseConfig(source, remoteSchemasValue) {
  const api = parseApiSection(source);
  const failures = [];

  if (api.enabled !== true) failures.push('[api].enabled must be true');
  compareExact(failures, '[api].schemas', api.schemas, allowedSchemas);
  compareExact(
    failures,
    '[api].extra_search_path',
    api.extra_search_path,
    allowedSearchPath,
  );
  if (
    !Number.isInteger(api.max_rows) ||
    api.max_rows < 1 ||
    api.max_rows > 1000
  ) {
    failures.push('[api].max_rows must be an integer from 1 through 1000');
  }

  const configured = [
    ...(Array.isArray(api.schemas) ? api.schemas : []),
    ...(Array.isArray(api.extra_search_path) ? api.extra_search_path : []),
  ];
  const exposedForbidden = forbiddenSchemas.filter((schema) =>
    configured.includes(schema),
  );
  if (exposedForbidden.length > 0) {
    failures.push(
      `internal schemas must not be exposed: ${exposedForbidden.join(', ')}`,
    );
  }

  let remoteSchemas;
  if (remoteSchemasValue?.trim()) {
    remoteSchemas = remoteSchemasValue
      .split(',')
      .map((schema) => schema.trim())
      .filter(Boolean);
    compareExact(
      failures,
      'remote Exposed schemas',
      remoteSchemas,
      allowedSchemas,
    );
  }

  return {
    status:
      failures.length === 0
        ? 'SUPABASE_CONFIG_PASSED'
        : 'SUPABASE_CONFIG_FAILED',
    localSchemas: Array.isArray(api.schemas) ? [...api.schemas].sort() : null,
    localExtraSearchPath: Array.isArray(api.extra_search_path)
      ? [...api.extra_search_path].sort()
      : null,
    remoteChecked: remoteSchemas !== undefined,
    remoteSchemas: remoteSchemas ? [...remoteSchemas].sort() : null,
    failures,
  };
}

export async function runSupabaseConfigCheck({
  configPath = 'supabase/config.toml',
  env = process.env,
  log = console.log,
} = {}) {
  const source = await readFile(configPath, 'utf8');
  const result = validateSupabaseConfig(
    source,
    env.SESN_REMOTE_EXPOSED_SCHEMAS,
  );
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(
      `Supabase configuration guard failed (${result.failures.length})`,
    );
  }
  return result;
}

function parseApiSection(source) {
  const result = {};
  let section = '';
  for (const originalLine of source.split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line.startsWith('#')) continue;
    const sectionMatch = /^\[([^\]]+)]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    if (section !== 'api') continue;
    const assignment = /^([a-z_]+)\s*=\s*(.+)$/.exec(line);
    if (!assignment) continue;
    result[assignment[1]] = parseValue(assignment[2]);
  }
  return result;
}

function parseValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return value;
}

function compareExact(failures, label, actual, expected) {
  if (!Array.isArray(actual)) {
    failures.push(`${label} must be an array`);
    return;
  }
  const normalized = [...new Set(actual)].sort();
  if (
    normalized.length !== actual.length ||
    normalized.length !== expected.length ||
    normalized.some((value, index) => value !== expected[index])
  ) {
    failures.push(`${label} must equal ${expected.join(', ')}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSupabaseConfigCheck().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Supabase config check failed',
    );
    process.exitCode = 1;
  });
}
