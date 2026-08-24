import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

export function validateDataMigrationPolicy(policy) {
  const failures = [];
  const execution = policy?.execution ?? {};
  const dedupe = policy?.deduplication ?? {};
  const rollback = policy?.rollback ?? {};
  const validation = policy?.validation ?? {};
  const security = policy?.security ?? {};
  const sourceMapping = policy?.sourceMapping ?? {};

  if (policy?.version !== 1) failures.push('policy version must be 1');
  if (policy?.scope !== 'initial-data-migration') {
    failures.push('scope must be initial-data-migration');
  }

  for (const [key, message] of [
    ['dryRunRequired', 'dry-run is required'],
    ['runIdRequired', 'run ID is required'],
    ['stagingValidationRequired', 'Staging validation is required'],
    ['rerunMustBeIdempotent', 'migration rerun must be idempotent'],
    ['partialSuccessMustBeVisible', 'partial success must be visible'],
  ]) {
    if (execution[key] !== true) failures.push(message);
  }
  if (execution.productionManualBulkEditAllowed !== false) {
    failures.push('manual Production bulk edit must be prohibited');
  }

  if (dedupe.rulesRequiredPerDataType !== true) {
    failures.push('deduplication rules are required per data type');
  }
  if (dedupe.stableSourceIdPreferred !== true) {
    failures.push('stable source ID must be preferred');
  }
  if (dedupe.nameOnlyAutomaticMergeAllowed !== false) {
    failures.push('name-only automatic merge must be prohibited');
  }
  if (dedupe.manualReviewPathRequiredForAmbiguousMatches !== true) {
    failures.push('ambiguous matches require a manual review path');
  }

  if (rollback.runScopedRollbackRequired !== true) {
    failures.push('run-scoped rollback is required');
  }
  if (rollback.rollbackDryRunRequired !== true) {
    failures.push('rollback dry-run is required');
  }
  if (rollback.fullTableDeleteAllowed !== false) {
    failures.push('full-table delete rollback must be prohibited');
  }
  if (rollback.irreversibleSideEffectsAllowedInsideMigration !== false) {
    failures.push('irreversible side effects inside migration must be prohibited');
  }
  if (rollback.updatedRowRecoveryRequired !== true) {
    failures.push('updated row recovery is required');
  }

  for (const [key, message] of [
    ['inputChecksumRequired', 'input checksum is required'],
    ['createdUpdatedSkippedRejectedCountsRequired', 'result counts are required'],
    ['referentialIntegrityRequired', 'referential integrity validation is required'],
    ['tenantBoundaryValidationRequired', 'tenant boundary validation is required'],
  ]) {
    if (validation[key] !== true) failures.push(message);
  }
  if (validation.rerunUnexpectedCreateTolerance !== 0) {
    failures.push('rerun unexpected create tolerance must be zero');
  }
  if (validation.tenantBoundaryViolationTolerance !== 0) {
    failures.push('tenant boundary violation tolerance must be zero');
  }

  for (const [key, message] of [
    ['productionSecretsInRepositoryAllowed', 'Production secrets in repository must be prohibited'],
    ['productionIdentifiersInRepositoryAllowed', 'Production identifiers in repository must be prohibited'],
    ['personalDataInRepositoryAllowed', 'personal data in repository must be prohibited'],
    ['personalDataInCiLogsAllowed', 'personal data in CI logs must be prohibited'],
  ]) {
    if (security[key] !== false) failures.push(message);
  }

  if (sourceMapping.status === 'deferred-until-source-confirmed') {
    for (const key of ['actualSourceSystem', 'actualFileNames', 'actualDeduplicationKeys']) {
      if (sourceMapping[key] !== null) {
        failures.push(`${key} must remain null while source mapping is deferred`);
      }
    }
  }

  return {
    status:
      failures.length === 0
        ? 'DATA_MIGRATION_POLICY_PASSED'
        : 'DATA_MIGRATION_POLICY_FAILED',
    failures,
  };
}

export async function runDataMigrationPolicyCheck({
  policyPath = 'ops/data-migration-policy.json',
  log = console.log,
} = {}) {
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  const result = validateDataMigrationPolicy(policy);
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(`Data migration policy check failed (${result.failures.length})`);
  }
  return result;
}

if (isMainModule(import.meta.url)) {
  runDataMigrationPolicyCheck().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Data migration policy check failed',
    );
    process.exitCode = 1;
  });
}
