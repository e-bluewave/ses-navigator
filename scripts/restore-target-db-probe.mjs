import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const allowedEnvironments = new Set(['Disposable', 'Staging']);
const supabasePostgresImagePattern = /(?:^|\/)supabase\/postgres(?::|$)/iu;
const expectedPostgresMajorVersion = 17;
const baselineGrantees = ['anon', 'authenticated', 'service_role'];
const pg17TablePrivileges = [
  'DELETE',
  'INSERT',
  'MAINTAIN',
  'REFERENCES',
  'SELECT',
  'TRIGGER',
  'TRUNCATE',
  'UPDATE',
];
const sequencePrivileges = ['SELECT', 'UPDATE', 'USAGE'];
const functionPrivileges = ['EXECUTE'];

export const defaultAclBaselineId = 'supabase-cli-2.111.0-local-postgres-17';

function expandBaseline({ ownerRole, schema, objectType, privileges }) {
  return baselineGrantees.flatMap((grantee) =>
    privileges.map((privilege) => ({
      ownerRole,
      schema,
      objectType,
      grantee,
      privilege,
      grantable: false,
    })),
  );
}

const fullPlatformSchemaBaseline = ({ ownerRole, schema }) => [
  ...expandBaseline({
    ownerRole,
    schema,
    objectType: 'tables',
    privileges: pg17TablePrivileges,
  }),
  ...expandBaseline({
    ownerRole,
    schema,
    objectType: 'sequences',
    privileges: sequencePrivileges,
  }),
  ...expandBaseline({
    ownerRole,
    schema,
    objectType: 'functions',
    privileges: functionPrivileges,
  }),
];

// Supabase CLI 2.111.0 local stacks on PostgreSQL 17 retain these platform
// defaults after the public Data API opt-in revokes have been applied.
export const pg17SupabaseLocalDefaultAclBaseline = Object.freeze(
  [
    ...expandBaseline({
      ownerRole: 'postgres',
      schema: 'public',
      objectType: 'tables',
      privileges: ['MAINTAIN', 'REFERENCES', 'TRIGGER', 'TRUNCATE'],
    }),
    ...expandBaseline({
      ownerRole: 'postgres',
      schema: 'public',
      objectType: 'sequences',
      privileges: ['UPDATE'],
    }),
    ...fullPlatformSchemaBaseline({
      ownerRole: 'postgres',
      schema: 'storage',
    }),
    ...['graphql', 'graphql_public', 'public', 'supabase_functions'].flatMap(
      (schema) =>
        fullPlatformSchemaBaseline({
          ownerRole: 'supabase_admin',
          schema,
        }),
    ),
  ].map((entry) => Object.freeze(entry)),
);

if (pg17SupabaseLocalDefaultAclBaseline.length !== 195) {
  throw new Error(
    'PG17 Supabase local default ACL baseline must have 195 tuples',
  );
}

export const defaultAclProbeSql = String.raw`
WITH monitored_default_acl AS (
  SELECT
    pg_get_userbyid(d.defaclrole) AS owner_role,
    COALESCE(n.nspname, '<global>') AS schema_name,
    CASE d.defaclobjtype
      WHEN 'r' THEN 'tables'
      WHEN 'S' THEN 'sequences'
      WHEN 'f' THEN 'functions'
      WHEN 'T' THEN 'types'
      WHEN 'n' THEN 'schemas'
      ELSE d.defaclobjtype::text
    END AS object_type,
    CASE
      WHEN acl.grantee = 0 THEN 'PUBLIC'
      ELSE grantee.rolname
    END AS grantee,
    acl.privilege_type AS privilege,
    acl.is_grantable AS grantable
  FROM pg_default_acl AS d
  CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
  LEFT JOIN pg_roles AS grantee
    ON grantee.oid = acl.grantee
  LEFT JOIN pg_namespace AS n
    ON n.oid = d.defaclnamespace
  WHERE acl.grantee = 0
     OR grantee.rolname IN ('anon', 'authenticated', 'service_role')
), aggregated AS (
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'ownerRole', owner_role,
        'schema', schema_name,
        'objectType', object_type,
        'grantee', grantee,
        'privilege', privilege,
        'grantable', grantable
      )
      ORDER BY owner_role, schema_name, object_type, grantee, privilege, grantable
    ),
    '[]'::json
  ) AS default_acl_entries
  FROM monitored_default_acl
)
SELECT json_build_object(
  'defaultAclEntries', default_acl_entries,
  'postgresMajorVersion', current_setting('server_version_num')::integer / 10000
)::text
FROM aggregated;
`;

const defaultAclTupleFields = [
  'ownerRole',
  'schema',
  'objectType',
  'grantee',
  'privilege',
];

export function defaultAclTupleKey(entry) {
  return JSON.stringify([
    entry.ownerRole,
    entry.schema,
    entry.objectType,
    entry.grantee,
    entry.privilege,
    entry.grantable,
  ]);
}

function isDefaultAclTuple(entry) {
  return (
    entry !== null &&
    typeof entry === 'object' &&
    !Array.isArray(entry) &&
    defaultAclTupleFields.every(
      (field) => typeof entry[field] === 'string' && entry[field] !== '',
    ) &&
    typeof entry.grantable === 'boolean'
  );
}

export function compareDefaultAclEntries(
  actualEntries,
  expectedEntries = pg17SupabaseLocalDefaultAclBaseline,
) {
  const actualByKey = new Map(
    actualEntries.map((entry) => [defaultAclTupleKey(entry), entry]),
  );
  const expectedByKey = new Map(
    expectedEntries.map((entry) => [defaultAclTupleKey(entry), entry]),
  );
  const unexpectedEntries = [...actualByKey]
    .filter(([key]) => !expectedByKey.has(key))
    .map(([, entry]) => entry);
  const missingEntries = [...expectedByKey]
    .filter(([key]) => !actualByKey.has(key))
    .map(([, entry]) => entry);

  return {
    actualDefaultAclEntryCount: actualByKey.size,
    expectedDefaultAclEntryCount: expectedByKey.size,
    unexpectedDefaultAclEntryCount: unexpectedEntries.length,
    missingDefaultAclEntryCount: missingEntries.length,
    defaultAclBaselineMatched:
      unexpectedEntries.length === 0 && missingEntries.length === 0,
    unexpectedEntries,
    missingEntries,
  };
}

export function parseDatabaseProbeOutput(stdout) {
  const text = String(stdout ?? '').trim();
  if (!text) {
    return { value: null, findings: ['database-probe-output-required'] };
  }

  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  const jsonLine = [...lines].reverse().find((line) => line.startsWith('{'));
  if (!jsonLine) {
    return { value: null, findings: ['database-probe-json-output-required'] };
  }

  try {
    const value = JSON.parse(jsonLine);
    if (!Array.isArray(value?.defaultAclEntries)) {
      return {
        value: null,
        findings: ['database-probe-default-acl-entries-invalid'],
      };
    }
    if (!value.defaultAclEntries.every(isDefaultAclTuple)) {
      return {
        value: null,
        findings: ['database-probe-default-acl-tuple-invalid'],
      };
    }
    const uniqueTupleCount = new Set(
      value.defaultAclEntries.map(defaultAclTupleKey),
    ).size;
    if (uniqueTupleCount !== value.defaultAclEntries.length) {
      return {
        value: null,
        findings: ['database-probe-default-acl-tuples-must-be-unique'],
      };
    }
    if (!Number.isInteger(value?.postgresMajorVersion)) {
      return {
        value: null,
        findings: ['database-probe-postgres-major-version-invalid'],
      };
    }
    return { value, findings: [] };
  } catch {
    return { value: null, findings: ['database-probe-json-invalid'] };
  }
}

export function evaluateLocalDockerTargetProbe({
  environment,
  containerName,
  requiredNameToken,
  containerRunning,
  imageName,
  databaseProbe,
}) {
  const findings = [];

  const environmentAllowed = allowedEnvironments.has(environment);
  const containerNamePresent =
    typeof containerName === 'string' && containerName.trim() !== '';
  const requiredNameTokenValid =
    typeof requiredNameToken === 'string' &&
    requiredNameToken.trim().length >= 4;

  if (!environmentAllowed) {
    findings.push('environment-must-be-disposable-or-staging');
  }
  if (!containerNamePresent) {
    findings.push('docker-container-name-required');
  }
  if (!requiredNameTokenValid) {
    findings.push('restore-target-name-token-minimum-length-4-required');
  }

  const tokenMatched =
    containerNamePresent &&
    requiredNameTokenValid &&
    containerName.toLowerCase().includes(requiredNameToken.toLowerCase());

  if (!tokenMatched) {
    findings.push('restore-target-name-token-mismatch');
  }
  if (containerRunning !== true) {
    findings.push('restore-target-container-must-be-running');
  }

  const supabasePostgresImage =
    typeof imageName === 'string' &&
    supabasePostgresImagePattern.test(imageName);
  if (!supabasePostgresImage) {
    findings.push('restore-target-must-use-supabase-postgres-image');
  }

  const databaseProbePresent =
    databaseProbe !== null && typeof databaseProbe === 'object';
  if (!databaseProbePresent) {
    findings.push('database-probe-result-required');
  }

  const defaultAclEntries = Array.isArray(databaseProbe?.defaultAclEntries)
    ? databaseProbe.defaultAclEntries
    : null;
  if (defaultAclEntries === null) {
    findings.push('default-acl-entries-required');
  }

  const defaultAclComparison = defaultAclEntries
    ? compareDefaultAclEntries(defaultAclEntries)
    : null;
  if (defaultAclComparison?.unexpectedDefaultAclEntryCount > 0) {
    findings.push('target-default-acl-unexpected-entries');
  }
  if (defaultAclComparison?.missingDefaultAclEntryCount > 0) {
    findings.push('target-default-acl-baseline-missing-entries');
  }

  const postgresMajorVersion = Number.isInteger(
    databaseProbe?.postgresMajorVersion,
  )
    ? databaseProbe.postgresMajorVersion
    : null;
  if (postgresMajorVersion === null) {
    findings.push('postgres-major-version-required');
  } else if (postgresMajorVersion !== expectedPostgresMajorVersion) {
    findings.push('postgres-major-version-17-required');
  }

  const defaultAclBaselineMatched =
    postgresMajorVersion === expectedPostgresMajorVersion &&
    defaultAclComparison?.defaultAclBaselineMatched === true;
  const riskyDefaultAclEntryCount =
    defaultAclComparison?.unexpectedDefaultAclEntryCount ?? null;

  // Target identity answers only whether this is the intended isolated restore
  // environment. ACL normalization is a separate security-posture requirement.
  // A previously restored Disposable database can therefore remain positively
  // identified while the full probe still fails closed until ACLs are normalized.
  const targetIdentityVerified =
    environmentAllowed &&
    containerNamePresent &&
    requiredNameTokenValid &&
    tokenMatched &&
    containerRunning === true &&
    supabasePostgresImage &&
    databaseProbePresent &&
    postgresMajorVersion !== null;

  const complete = findings.length === 0;
  return {
    status: complete
      ? 'RESTORE_TARGET_PROBE_PASSED'
      : 'RESTORE_TARGET_PROBE_FAILED',
    complete,
    findings,
    probe: {
      version: 1,
      mode: 'local-docker-supabase',
      environment,
      productionTarget: false,
      separateRestoreEnvironment: targetIdentityVerified,
      targetIdentityVerified,
      targetDefaultAclNormalized: defaultAclBaselineMatched,
      databaseReachable: databaseProbe !== null,
      localDockerContainer: containerRunning === true,
      supabasePostgresImage,
      requiredNameTokenMatched: tokenMatched,
      riskyDefaultAclEntryCount,
      actualDefaultAclEntryCount:
        defaultAclComparison?.actualDefaultAclEntryCount ?? null,
      expectedDefaultAclEntryCount:
        defaultAclComparison?.expectedDefaultAclEntryCount ??
        pg17SupabaseLocalDefaultAclBaseline.length,
      unexpectedDefaultAclEntryCount:
        defaultAclComparison?.unexpectedDefaultAclEntryCount ?? null,
      missingDefaultAclEntryCount:
        defaultAclComparison?.missingDefaultAclEntryCount ?? null,
      defaultAclBaselineMatched,
      defaultAclBaselineId,
      postgresMajorVersion,
      secretFreeProbe: true,
    },
  };
}

export async function runLocalDockerTargetProbe({
  environment,
  containerName,
  requiredNameToken,
  outputPath,
  runCommand = runLocalCommand,
  log = console.log,
} = {}) {
  const inspectState = runCommand('docker', [
    'inspect',
    '--format',
    '{{.State.Running}}',
    containerName ?? '',
  ]);
  const inspectImage = runCommand('docker', [
    'inspect',
    '--format',
    '{{.Config.Image}}',
    containerName ?? '',
  ]);

  const containerRunning =
    inspectState.status === 0 && String(inspectState.stdout).trim() === 'true';
  const imageName =
    inspectImage.status === 0 ? String(inspectImage.stdout).trim() : '';

  let databaseProbe = null;
  const preDatabaseFindings = [];

  if (inspectState.status !== 0 || inspectImage.status !== 0) {
    preDatabaseFindings.push('docker-target-inspection-failed');
  }

  if (containerRunning) {
    const databaseResult = runCommand('docker', [
      'exec',
      '-i',
      containerName ?? '',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-X',
      '-A',
      '-t',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      defaultAclProbeSql,
    ]);

    if (databaseResult.status !== 0) {
      preDatabaseFindings.push('database-probe-command-failed');
    } else {
      const parsed = parseDatabaseProbeOutput(databaseResult.stdout);
      preDatabaseFindings.push(...parsed.findings);
      databaseProbe = parsed.value;
    }
  }

  const result = evaluateLocalDockerTargetProbe({
    environment,
    containerName,
    requiredNameToken,
    containerRunning,
    imageName,
    databaseProbe,
  });

  if (preDatabaseFindings.length > 0) {
    result.findings.unshift(...preDatabaseFindings);
    result.complete = false;
    result.status = 'RESTORE_TARGET_PROBE_FAILED';
    result.probe.separateRestoreEnvironment = false;
    result.probe.targetIdentityVerified = false;
    result.probe.databaseReachable = false;
  }

  const output = JSON.stringify(result, null, 2);
  log(output);

  if (outputPath) {
    await writeFile(outputPath, `${output}\n`, 'utf8');
  }

  if (!result.complete) {
    throw new Error(`Restore target probe failed (${result.findings.length})`);
  }
  return result;
}

function runLocalCommand(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
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
  runLocalDockerTargetProbe({
    environment: args.environment,
    containerName: args.container,
    requiredNameToken: args['required-name-token'],
    outputPath: args.output,
  }).catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Restore target probe failed',
    );
    process.exitCode = 1;
  });
}
