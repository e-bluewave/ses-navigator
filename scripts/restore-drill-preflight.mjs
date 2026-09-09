import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isMainModule } from './cli-entry.mjs';

const allowedFactFields = new Set([
  'version',
  'environment',
  'productionTarget',
  'separateRestoreEnvironment',
  'targetIdentityVerified',
  'productionSecretsReused',
  'databaseBackupRunLinked',
  'storageBackupRunLinked',
  'restorePointAlignment',
  'targetDefaultAclNormalized',
  'migrationBaselineRecorded',
  'applicationSchemaBaselineRecorded',
  'restoreCommandSingleTransaction',
  'restoreCommandOnErrorStop',
  'artifactCopyHashParity',
  'customRoleCount',
  'roleReplayMode',
  'reservedRoleReplayPlanned',
  'storageRestoreViaApiOrS3Planned',
  'storageProtectDeleteDisablePlanned',
  'falsePassGuardReady',
  'secretFreeFacts',
]);

const allowedEnvironments = new Set(['Disposable', 'Staging']);
const allowedRestorePointAlignment = new Set(['PASS']);
const allowedArtifactCopyHashParity = new Set(['PASS', 'NOT_APPLICABLE']);
const allowedRoleReplayModes = new Set([
  'custom-only',
  'intentional-skip-empty-custom-set',
]);
const reservedRoleNames = new Set([
  'anon',
  'authenticated',
  'authenticator',
  'dashboard_user',
  'pgbouncer',
  'pgsodium_keyholder',
  'pgsodium_keyiduser',
  'pgsodium_keymaker',
  'postgres',
  'service_role',
]);
const storageManagedReferencePattern =
  /\bstorage\s*\.\s*(?:buckets|objects|buckets_vectors|vector_indexes)\b/iu;
const storageManagedSchemaPattern =
  /\b(?:create|alter|drop)\s+schema\s+(?:if\s+(?:not\s+)?exists\s+)?"?storage"?\b/iu;
const storageSearchPathPattern =
  /\b(?:set|select\s+set_config\s*\()\s*[^;\n]*\bsearch_path\b[^;\n]*\bstorage\b/iu;

export function validateRestorePreflightFacts(facts) {
  const findings = [];

  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) {
    return failed(['facts-object-required']);
  }

  for (const key of Object.keys(facts)) {
    if (!allowedFactFields.has(key)) findings.push(`unknown-field:${key}`);
  }

  if (facts.version !== 1) findings.push('facts-version-must-be-1');
  if (!allowedEnvironments.has(facts.environment)) {
    findings.push('environment-must-be-disposable-or-staging');
  }
  if (facts.productionTarget !== false) {
    findings.push('production-target-must-be-false');
  }
  if (facts.separateRestoreEnvironment !== true) {
    findings.push('separate-restore-environment-must-be-true');
  }
  if (facts.targetIdentityVerified !== true) {
    findings.push('target-identity-verification-required');
  }
  if (facts.productionSecretsReused !== false) {
    findings.push('production-secrets-reuse-must-be-false');
  }
  if (facts.databaseBackupRunLinked !== true) {
    findings.push('database-backup-link-required');
  }
  if (facts.storageBackupRunLinked !== true) {
    findings.push('storage-backup-link-required');
  }
  if (!allowedRestorePointAlignment.has(facts.restorePointAlignment)) {
    findings.push('restore-point-alignment-must-pass');
  }
  if (facts.targetDefaultAclNormalized !== true) {
    findings.push('target-default-acl-must-be-normalized');
  }
  if (facts.migrationBaselineRecorded !== true) {
    findings.push('migration-baseline-must-be-recorded');
  }
  if (facts.applicationSchemaBaselineRecorded !== true) {
    findings.push('application-schema-baseline-must-be-recorded');
  }
  if (facts.restoreCommandSingleTransaction !== true) {
    findings.push('single-transaction-restore-required');
  }
  if (facts.restoreCommandOnErrorStop !== true) {
    findings.push('on-error-stop-restore-required');
  }
  if (!allowedArtifactCopyHashParity.has(facts.artifactCopyHashParity)) {
    findings.push('artifact-copy-hash-parity-must-pass-or-be-not-applicable');
  }
  if (!Number.isInteger(facts.customRoleCount) || facts.customRoleCount < 0) {
    findings.push('custom-role-count-must-be-non-negative-integer');
  }
  if (!allowedRoleReplayModes.has(facts.roleReplayMode)) {
    findings.push('role-replay-mode-invalid');
  }
  if (facts.reservedRoleReplayPlanned !== false) {
    findings.push('reserved-role-replay-must-be-false');
  }
  if (
    Number.isInteger(facts.customRoleCount) &&
    facts.customRoleCount === 0 &&
    facts.roleReplayMode !== 'intentional-skip-empty-custom-set'
  ) {
    findings.push('empty-custom-role-set-must-use-intentional-skip');
  }
  if (
    Number.isInteger(facts.customRoleCount) &&
    facts.customRoleCount > 0 &&
    facts.roleReplayMode !== 'custom-only'
  ) {
    findings.push('non-empty-custom-role-set-must-use-custom-only-replay');
  }
  if (facts.storageRestoreViaApiOrS3Planned !== true) {
    findings.push('storage-restore-must-use-api-or-s3');
  }
  if (facts.storageProtectDeleteDisablePlanned !== false) {
    findings.push('storage-protect-delete-disable-must-be-false');
  }
  if (facts.falsePassGuardReady !== true) {
    findings.push('false-pass-guard-must-be-ready');
  }
  if (facts.secretFreeFacts !== true) {
    findings.push('secret-free-facts-must-be-true');
  }

  return {
    findings,
  };
}

export function decodeStrictUtf8(buffer, label) {
  const findings = [];
  if (!Buffer.isBuffer(buffer)) {
    return { text: '', findings: [`${label}-buffer-required`] };
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    findings.push(`${label}-utf8-bom-prohibited`);
  }

  let text = '';
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    findings.push(`${label}-strict-utf8-required`);
  }

  return { text, findings };
}

export function parseRestorePreflightFactsBuffer(buffer) {
  const decoded = decodeStrictUtf8(buffer, 'facts');
  if (decoded.findings.length > 0) {
    return { facts: null, findings: decoded.findings };
  }

  try {
    return { facts: JSON.parse(decoded.text), findings: [] };
  } catch {
    return { facts: null, findings: ['facts-json-invalid'] };
  }
}

export function inspectRestoreSqlArtifacts({
  rolesText,
  schemaText,
  dataText,
}) {
  const findings = [];
  const roleNames = discoverDefinedRoles(rolesText);
  const customRoles = [...roleNames].filter((name) => !isReservedRole(name));
  const reservedRoles = [...roleNames].filter((name) => isReservedRole(name));

  for (const [label, text] of [
    ['roles', rolesText],
    ['schema', schemaText],
    ['data', dataText],
  ]) {
    const executableSql = stripSqlComments(text);
    if (
      storageManagedReferencePattern.test(executableSql) ||
      storageManagedSchemaPattern.test(executableSql) ||
      storageSearchPathPattern.test(executableSql)
    ) {
      findings.push(`storage-managed-sql-reference:${label}`);
    }
  }

  return {
    findings,
    customRoleCountDiscovered: customRoles.length,
    reservedRoleCountDiscovered: reservedRoles.length,
  };
}

export function evaluateRestorePreflight({
  facts,
  rolesText,
  schemaText,
  dataText,
  dependencyState,
}) {
  const factsResult = validateRestorePreflightFacts(facts);
  const sqlResult = inspectRestoreSqlArtifacts({
    rolesText,
    schemaText,
    dataText,
  });
  const findings = [...factsResult.findings, ...sqlResult.findings];

  if (
    Number.isInteger(facts?.customRoleCount) &&
    facts.customRoleCount !== sqlResult.customRoleCountDiscovered
  ) {
    findings.push('custom-role-count-does-not-match-roles-artifact');
  }

  if (dependencyState?.lockfilePresent !== true) {
    findings.push('pnpm-lockfile-required-before-restore');
  }
  if (dependencyState?.typescriptBinaryPresent !== true) {
    findings.push('typescript-binary-required-before-application-smoke');
  }
  if (dependencyState?.packageManagerPinned !== true) {
    findings.push('package-manager-pin-required');
  }

  return {
    status:
      findings.length === 0
        ? 'RESTORE_PREFLIGHT_PASSED'
        : 'RESTORE_PREFLIGHT_FAILED',
    complete: findings.length === 0,
    findings,
    checks: {
      productionTarget: facts?.productionTarget === false,
      targetIdentityVerified: facts?.targetIdentityVerified === true,
      defaultAclNormalized: facts?.targetDefaultAclNormalized === true,
      migrationBaselineRecorded: facts?.migrationBaselineRecorded === true,
      applicationSchemaBaselineRecorded:
        facts?.applicationSchemaBaselineRecorded === true,
      singleTransactionPlanned: facts?.restoreCommandSingleTransaction === true,
      onErrorStopPlanned: facts?.restoreCommandOnErrorStop === true,
      storageRestoreViaApiOrS3Planned:
        facts?.storageRestoreViaApiOrS3Planned === true,
      storageProtectDeleteWillRemainEnabled:
        facts?.storageProtectDeleteDisablePlanned === false,
      dependencyReady:
        dependencyState?.lockfilePresent === true &&
        dependencyState?.typescriptBinaryPresent === true &&
        dependencyState?.packageManagerPinned === true,
      storageManagedSqlAbsent: !sqlResult.findings.some((finding) =>
        finding.startsWith('storage-managed-sql-reference:'),
      ),
    },
    customRoleCountDiscovered: sqlResult.customRoleCountDiscovered,
    reservedRoleCountDiscovered: sqlResult.reservedRoleCountDiscovered,
  };
}

export async function inspectDependencyReadiness(repoRoot = '.') {
  const [lockfilePresent, typescriptBinaryPresent, packageManagerPinned] =
    await Promise.all([
      pathExists(join(repoRoot, 'pnpm-lock.yaml')),
      anyPathExists([
        join(repoRoot, 'node_modules', '.bin', 'tsc'),
        join(repoRoot, 'node_modules', '.bin', 'tsc.cmd'),
        join(repoRoot, 'node_modules', '.bin', 'tsc.ps1'),
      ]),
      readPinnedPackageManager(repoRoot),
    ]);

  return {
    lockfilePresent,
    typescriptBinaryPresent,
    packageManagerPinned,
  };
}

export async function runRestoreDrillPreflight({
  factsPath,
  rolesPath,
  schemaPath,
  dataPath,
  repoRoot = '.',
  log = console.log,
} = {}) {
  if (!factsPath || !rolesPath || !schemaPath || !dataPath) {
    throw new Error(
      'Restore preflight requires --facts, --roles, --schema and --data paths',
    );
  }

  const [factsBuffer, rolesBuffer, schemaBuffer, dataBuffer, dependencyState] =
    await Promise.all([
      readFile(factsPath),
      readFile(rolesPath),
      readFile(schemaPath),
      readFile(dataPath),
      inspectDependencyReadiness(repoRoot),
    ]);

  const factsParsed = parseRestorePreflightFactsBuffer(factsBuffer);
  const decodedArtifacts = {
    roles: decodeStrictUtf8(rolesBuffer, 'roles-sql'),
    schema: decodeStrictUtf8(schemaBuffer, 'schema-sql'),
    data: decodeStrictUtf8(dataBuffer, 'data-sql'),
  };
  const encodingFindings = [
    ...factsParsed.findings,
    ...decodedArtifacts.roles.findings,
    ...decodedArtifacts.schema.findings,
    ...decodedArtifacts.data.findings,
  ];

  if (encodingFindings.length > 0 || !factsParsed.facts) {
    const result = failed(encodingFindings);
    log(JSON.stringify(result, null, 2));
    throw new Error(`Restore preflight failed (${result.findings.length})`);
  }

  const result = evaluateRestorePreflight({
    facts: factsParsed.facts,
    rolesText: decodedArtifacts.roles.text,
    schemaText: decodedArtifacts.schema.text,
    dataText: decodedArtifacts.data.text,
    dependencyState,
  });
  log(JSON.stringify(result, null, 2));
  if (!result.complete) {
    throw new Error(`Restore preflight failed (${result.findings.length})`);
  }
  return result;
}

function discoverDefinedRoles(sql) {
  const roleNames = new Set();
  const executableSql = stripSqlComments(sql);
  const patterns = [
    /\b(?:create|alter|drop)\s+role\s+(?:if\s+exists\s+)?("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$-]*)/giu,
    /\bcomment\s+on\s+role\s+("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$-]*)/giu,
  ];

  for (const pattern of patterns) {
    for (const match of executableSql.matchAll(pattern)) {
      const roleName = unquoteIdentifier(match[1]);
      if (roleName) roleNames.add(roleName);
    }
  }
  return roleNames;
}

function isReservedRole(roleName) {
  const normalized = roleName.toLowerCase();
  return (
    reservedRoleNames.has(normalized) ||
    normalized.startsWith('pg_') ||
    normalized.startsWith('supabase_')
  );
}

function stripSqlComments(sql = '') {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/--[^\r\n]*/gu, ' ');
}

function unquoteIdentifier(identifier) {
  if (!identifier) return '';
  if (identifier.startsWith('"') && identifier.endsWith('"')) {
    return identifier.slice(1, -1).replace(/""/gu, '"');
  }
  return identifier;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function anyPathExists(paths) {
  const results = await Promise.all(paths.map((path) => pathExists(path)));
  return results.some(Boolean);
}

async function readPinnedPackageManager(repoRoot) {
  try {
    const packageJson = JSON.parse(
      await readFile(join(repoRoot, 'package.json'), 'utf8'),
    );
    return /^pnpm@\d+\.\d+\.\d+$/u.test(packageJson.packageManager ?? '');
  } catch {
    return false;
  }
}

function failed(findings) {
  return {
    status: 'RESTORE_PREFLIGHT_FAILED',
    complete: false,
    findings,
  };
}

function parseCliArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) continue;
    values[key.slice(2)] = value;
    index += 1;
  }
  return values;
}

if (isMainModule(import.meta.url)) {
  const args = parseCliArgs(process.argv.slice(2));
  runRestoreDrillPreflight({
    factsPath: args.facts,
    rolesPath: args.roles,
    schemaPath: args.schema,
    dataPath: args.data,
    repoRoot: args.repo ?? '.',
  }).catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Restore preflight failed',
    );
    process.exitCode = 1;
  });
}
