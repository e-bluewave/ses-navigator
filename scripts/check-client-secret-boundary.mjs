import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const FORBIDDEN_PATTERNS = [
  {
    rule: 'service-role-environment-variable',
    pattern:
      /\b(?:VITE_)?(?:SESN_)?SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY\b|\b(?:VITE_)?SERVICE_ROLE_KEY\b/g,
  },
  { rule: 'supabase-secret-key-value', pattern: /\bsb_secret_[A-Za-z0-9_-]+/g },
  { rule: 'service-role-jwt-claim', pattern: /["']service_role["']/g },
  {
    rule: 'vite-secret-environment-variable',
    pattern:
      /\bVITE_[A-Z0-9_]*(?:SECRET|PRIVATE_KEY|SERVICE_ROLE)[A-Z0-9_]*\b/g,
  },
];

const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.ts',
  '.tsx',
]);

export function validateClientSecretBoundary(files) {
  const findings = [];

  for (const file of files) {
    const lines = file.source.split(/\r?\n/u);
    for (const [index, line] of lines.entries()) {
      for (const { rule, pattern } of FORBIDDEN_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          findings.push({ file: file.name, line: index + 1, rule });
        }
      }
    }
  }

  return {
    status:
      findings.length === 0
        ? 'CLIENT_SECRET_BOUNDARY_PASSED'
        : 'CLIENT_SECRET_BOUNDARY_FAILED',
    scannedFileCount: files.length,
    findings,
  };
}

export async function runClientSecretBoundaryCheck({
  webPath = 'apps/web',
  log = console.log,
} = {}) {
  const files = await readTree(webPath);
  const result = validateClientSecretBoundary(files);
  log(JSON.stringify(result, null, 2));
  if (result.findings.length > 0) {
    throw new Error(
      `Client secret boundary guard failed (${result.findings.length})`,
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
      if (entry.name === 'node_modules') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (isTextFile(entry.name)) {
        files.push({
          name: relative('.', path),
          source: await readFile(path, 'utf8'),
        });
      }
    }
  }

  await visit(root);
  return files;
}

function isTextFile(name) {
  return name.startsWith('.env') || TEXT_EXTENSIONS.has(extname(name));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runClientSecretBoundaryCheck().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Client secret check failed',
    );
    process.exitCode = 1;
  });
}
