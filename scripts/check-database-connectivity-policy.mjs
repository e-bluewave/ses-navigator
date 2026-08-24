import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const expectedModes = new Set(['data-api', 'transaction-pooler']);

export function validateDatabaseConnectivityPolicy({ policy, env = {} }) {
  const failures = [];
  const regionPolicy = policy?.regionPolicy ?? {};
  const connections = policy?.connections ?? {};

  if (policy?.version !== 1) failures.push('policy version must be 1');
  if (regionPolicy.databaseFirst !== true) {
    failures.push('database-first region selection is required');
  }
  if (regionPolicy.functionMustBeNearDatabase !== true) {
    failures.push('functions must be near the database');
  }
  if (regionPolicy.crossRegionProductionTrafficRequiresException !== true) {
    failures.push('cross-region Production traffic must require an exception');
  }
  if (connections.browser !== 'data-api') {
    failures.push('browser access must use Data API');
  }
  if (connections.serverRuntimeDefault !== 'data-api') {
    failures.push('server runtime default must use Data API');
  }
  if (connections.serverRuntimeDirectSql !== 'transaction-pooler') {
    failures.push('direct SQL runtime must use transaction pooler');
  }
  if (connections.serverRuntimeDirectSqlPort !== 6543) {
    failures.push('transaction pooler port must be 6543');
  }
  if (connections.preparedStatementsAllowedOnTransactionPooler !== false) {
    failures.push('prepared statements must be disabled on transaction pooler');
  }
  if (connections.transactionPoolerAllowedForMigration !== false) {
    failures.push('transaction pooler must not be used for migrations');
  }
  if (connections.transactionPoolerAllowedForBackupRestore !== false) {
    failures.push('transaction pooler must not be used for backup or restore');
  }

  const stagingRegion = env.SESN_STAGING_REGION_GROUP?.trim();
  const productionRegion = env.SESN_PRODUCTION_REGION_GROUP?.trim();
  const stagingMode = env.SESN_STAGING_DATABASE_MODE?.trim();
  const productionMode = env.SESN_PRODUCTION_DATABASE_MODE?.trim();
  const runtimeValues = [
    stagingRegion,
    productionRegion,
    stagingMode,
    productionMode,
  ];
  const suppliedCount = runtimeValues.filter(Boolean).length;
  const runtimeBindingsChecked = suppliedCount > 0;

  if (runtimeBindingsChecked && suppliedCount !== runtimeValues.length) {
    failures.push(
      'all runtime region and database mode values must be supplied together',
    );
  }
  if (stagingRegion && productionRegion && stagingRegion !== productionRegion) {
    failures.push('Staging and Production region groups must match');
  }
  if (stagingMode && !expectedModes.has(stagingMode)) {
    failures.push('invalid Staging database mode');
  }
  if (productionMode && !expectedModes.has(productionMode)) {
    failures.push('invalid Production database mode');
  }
  if (stagingMode && productionMode && stagingMode !== productionMode) {
    failures.push('Staging and Production database modes must match');
  }

  return {
    status:
      failures.length === 0
        ? 'DATABASE_CONNECTIVITY_PASSED'
        : 'DATABASE_CONNECTIVITY_FAILED',
    runtimeBindingsChecked,
    failures,
  };
}

export async function runDatabaseConnectivityCheck({
  policyPath = 'ops/database-connectivity-policy.json',
  env = process.env,
  log = console.log,
} = {}) {
  const policyText = await readFile(policyPath, 'utf8');
  const result = validateDatabaseConnectivityPolicy({
    policy: JSON.parse(policyText),
    env,
  });
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(
      `Database connectivity policy check failed (${result.failures.length})`,
    );
  }
  return result;
}

if (isMainModule(import.meta.url)) {
  runDatabaseConnectivityCheck().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Database connectivity policy check failed',
    );
    process.exitCode = 1;
  });
}
