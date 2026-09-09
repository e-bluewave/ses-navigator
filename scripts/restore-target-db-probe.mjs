import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const allowedEnvironments = new Set(['Disposable', 'Staging']);
const supabasePostgresImagePattern = /(?:^|\/)supabase\/postgres(?::|$)/iu;

export const defaultAclProbeSql = String.raw`
WITH risky_default_acl AS (
  SELECT count(*)::integer AS risky_count
  FROM pg_default_acl AS d
  CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
  LEFT JOIN pg_roles AS grantee
    ON grantee.oid = acl.grantee
  WHERE acl.grantee = 0
     OR grantee.rolname IN ('anon', 'authenticated', 'service_role')
)
SELECT json_build_object(
  'riskyDefaultAclEntryCount', risky_count,
  'postgresMajorVersion', current_setting('server_version_num')::integer / 10000
)::text
FROM risky_default_acl;
`;

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
    if (
      !Number.isInteger(value?.riskyDefaultAclEntryCount) ||
      value.riskyDefaultAclEntryCount < 0
    ) {
      return {
        value: null,
        findings: ['database-probe-risky-default-acl-count-invalid'],
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

  if (!allowedEnvironments.has(environment)) {
    findings.push('environment-must-be-disposable-or-staging');
  }
  if (typeof containerName !== 'string' || containerName.trim() === '') {
    findings.push('docker-container-name-required');
  }
  if (
    typeof requiredNameToken !== 'string' ||
    requiredNameToken.trim().length < 4
  ) {
    findings.push('restore-target-name-token-minimum-length-4-required');
  }

  const tokenMatched =
    typeof containerName === 'string' &&
    typeof requiredNameToken === 'string' &&
    requiredNameToken.trim().length >= 4 &&
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

  if (!databaseProbe || typeof databaseProbe !== 'object') {
    findings.push('database-probe-result-required');
  }

  const riskyDefaultAclEntryCount = Number.isInteger(
    databaseProbe?.riskyDefaultAclEntryCount,
  )
    ? databaseProbe.riskyDefaultAclEntryCount
    : null;

  if (riskyDefaultAclEntryCount === null) {
    findings.push('risky-default-acl-entry-count-required');
  }
  if (
    Number.isInteger(riskyDefaultAclEntryCount) &&
    riskyDefaultAclEntryCount !== 0
  ) {
    findings.push('target-default-acl-not-normalized');
  }

  const postgresMajorVersion = Number.isInteger(
    databaseProbe?.postgresMajorVersion,
  )
    ? databaseProbe.postgresMajorVersion
    : null;
  if (postgresMajorVersion === null) {
    findings.push('postgres-major-version-required');
  }

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
      separateRestoreEnvironment: complete,
      targetIdentityVerified: complete,
      targetDefaultAclNormalized:
        Number.isInteger(riskyDefaultAclEntryCount) &&
        riskyDefaultAclEntryCount === 0,
      databaseReachable: databaseProbe !== null,
      localDockerContainer: containerRunning === true,
      supabasePostgresImage,
      requiredNameTokenMatched: tokenMatched,
      riskyDefaultAclEntryCount,
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
