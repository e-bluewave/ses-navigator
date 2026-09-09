import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';
import {
  decodeStrictUtf8,
  evaluateRestorePreflight,
  inspectDependencyReadiness,
  parseRestorePreflightFactsBuffer,
} from './restore-drill-preflight.mjs';
import { runLocalDockerTargetProbe } from './restore-target-db-probe.mjs';

const machineSuppliedFactFields = [
  'environment',
  'productionTarget',
  'separateRestoreEnvironment',
  'targetIdentityVerified',
  'targetDefaultAclNormalized',
];

export function mergeTargetProbeFacts(facts, targetProbeResult) {
  const findings = [];
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) {
    return { facts: null, findings: ['facts-object-required'] };
  }

  if (
    targetProbeResult?.status !== 'RESTORE_TARGET_PROBE_PASSED' ||
    targetProbeResult?.complete !== true ||
    targetProbeResult?.probe?.secretFreeProbe !== true
  ) {
    return {
      facts: null,
      findings: ['passed-secret-free-target-probe-required'],
    };
  }

  const probeFacts = {
    environment: targetProbeResult.probe.environment,
    productionTarget: targetProbeResult.probe.productionTarget,
    separateRestoreEnvironment:
      targetProbeResult.probe.separateRestoreEnvironment,
    targetIdentityVerified: targetProbeResult.probe.targetIdentityVerified,
    targetDefaultAclNormalized:
      targetProbeResult.probe.targetDefaultAclNormalized,
  };

  for (const field of machineSuppliedFactFields) {
    if (
      Object.hasOwn(facts, field) &&
      facts[field] !== undefined &&
      facts[field] !== probeFacts[field]
    ) {
      findings.push(`target-probe-facts-conflict:${field}`);
    }
  }

  if (findings.length > 0) {
    return { facts: null, findings };
  }

  return {
    facts: { ...facts, ...probeFacts },
    findings: [],
  };
}

export async function runLocalRestorePreflight({
  factsPath,
  rolesPath,
  schemaPath,
  dataPath,
  repoRoot = '.',
  environment,
  containerName,
  requiredNameToken,
  log = console.log,
} = {}) {
  if (!factsPath || !rolesPath || !schemaPath || !dataPath) {
    throw new Error(
      'Local restore preflight requires --facts, --roles, --schema and --data paths',
    );
  }

  let targetProbeResult = null;
  try {
    await runLocalDockerTargetProbe({
      environment,
      containerName,
      requiredNameToken,
      log: (text) => {
        targetProbeResult = JSON.parse(text);
      },
    });
  } catch {
    const failedResult = {
      status: 'RESTORE_LOCAL_PREFLIGHT_FAILED',
      complete: false,
      findings: targetProbeResult?.findings ?? ['restore-target-probe-failed'],
      targetProbe: targetProbeResult?.probe ?? null,
    };
    log(JSON.stringify(failedResult, null, 2));
    throw new Error(
      `Local restore preflight failed (${failedResult.findings.length})`,
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
  const initialFindings = [
    ...factsParsed.findings,
    ...decodedArtifacts.roles.findings,
    ...decodedArtifacts.schema.findings,
    ...decodedArtifacts.data.findings,
  ];

  if (initialFindings.length > 0 || !factsParsed.facts) {
    const failedResult = {
      status: 'RESTORE_LOCAL_PREFLIGHT_FAILED',
      complete: false,
      findings: initialFindings,
      targetProbe: targetProbeResult.probe,
    };
    log(JSON.stringify(failedResult, null, 2));
    throw new Error(
      `Local restore preflight failed (${failedResult.findings.length})`,
    );
  }

  const merged = mergeTargetProbeFacts(factsParsed.facts, targetProbeResult);
  if (merged.findings.length > 0 || !merged.facts) {
    const failedResult = {
      status: 'RESTORE_LOCAL_PREFLIGHT_FAILED',
      complete: false,
      findings: merged.findings,
      targetProbe: targetProbeResult.probe,
    };
    log(JSON.stringify(failedResult, null, 2));
    throw new Error(
      `Local restore preflight failed (${failedResult.findings.length})`,
    );
  }

  const restoreResult = evaluateRestorePreflight({
    facts: merged.facts,
    rolesText: decodedArtifacts.roles.text,
    schemaText: decodedArtifacts.schema.text,
    dataText: decodedArtifacts.data.text,
    dependencyState,
  });

  const result = {
    status: restoreResult.complete
      ? 'RESTORE_LOCAL_PREFLIGHT_PASSED'
      : 'RESTORE_LOCAL_PREFLIGHT_FAILED',
    complete: restoreResult.complete,
    findings: restoreResult.findings,
    targetProbe: targetProbeResult.probe,
    checks: restoreResult.checks,
    customRoleCountDiscovered: restoreResult.customRoleCountDiscovered,
    reservedRoleCountDiscovered: restoreResult.reservedRoleCountDiscovered,
  };

  log(JSON.stringify(result, null, 2));
  if (!result.complete) {
    throw new Error(
      `Local restore preflight failed (${result.findings.length})`,
    );
  }
  return result;
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
  runLocalRestorePreflight({
    factsPath: args.facts,
    rolesPath: args.roles,
    schemaPath: args.schema,
    dataPath: args.data,
    repoRoot: args.repo ?? '.',
    environment: args.environment,
    containerName: args.container,
    requiredNameToken: args['required-name-token'],
  }).catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Local restore preflight failed',
    );
    process.exitCode = 1;
  });
}
