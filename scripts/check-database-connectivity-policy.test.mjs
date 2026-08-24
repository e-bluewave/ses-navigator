import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateDatabaseConnectivityPolicy,
} from './check-database-connectivity-policy.mjs';

const policy = {
  version: 1,
  regionPolicy: {
    databaseFirst: true,
    functionMustBeNearDatabase: true,
    crossRegionProductionTrafficRequiresException: true,
    stagingMustMatchProductionRegionClass: true,
  },
  connections: {
    browser: 'data-api',
    serverRuntimeDefault: 'data-api',
    serverRuntimeDirectSql: 'transaction-pooler',
    serverRuntimeDirectSqlPort: 6543,
    preparedStatementsAllowedOnTransactionPooler: false,
    migration: 'direct-or-session-pooler',
    backupRestore: 'direct-or-session-pooler',
    transactionPoolerAllowedForMigration: false,
    transactionPoolerAllowedForBackupRestore: false,
  },
};

test('accepts the reviewed static connectivity policy', () => {
  const result = validateDatabaseConnectivityPolicy({ policy });
  assert.equal(result.status, 'DATABASE_CONNECTIVITY_PASSED');
  assert.equal(result.runtimeBindingsChecked, false);
  assert.deepEqual(result.failures, []);
});

test('accepts matching runtime region and database modes', () => {
  const result = validateDatabaseConnectivityPolicy({
    policy,
    env: {
      SESN_STAGING_REGION_GROUP: 'asia-northeast',
      SESN_PRODUCTION_REGION_GROUP: 'asia-northeast',
      SESN_STAGING_DATABASE_MODE: 'data-api',
      SESN_PRODUCTION_DATABASE_MODE: 'data-api',
    },
  });
  assert.equal(result.status, 'DATABASE_CONNECTIVITY_PASSED');
  assert.equal(result.runtimeBindingsChecked, true);
});

test('rejects cross-region runtime bindings', () => {
  const result = validateDatabaseConnectivityPolicy({
    policy,
    env: {
      SESN_STAGING_REGION_GROUP: 'asia-northeast',
      SESN_PRODUCTION_REGION_GROUP: 'us-east',
      SESN_STAGING_DATABASE_MODE: 'data-api',
      SESN_PRODUCTION_DATABASE_MODE: 'data-api',
    },
  });
  assert.ok(
    result.failures.includes(
      'Staging and Production region groups must match',
    ),
  );
});

test('rejects transaction pooler for migrations', () => {
  const result = validateDatabaseConnectivityPolicy({
    policy: {
      ...policy,
      connections: {
        ...policy.connections,
        transactionPoolerAllowedForMigration: true,
      },
    },
  });
  assert.ok(
    result.failures.includes(
      'transaction pooler must not be used for migrations',
    ),
  );
});

test('rejects invalid or incomplete runtime configuration', () => {
  const result = validateDatabaseConnectivityPolicy({
    policy,
    env: {
      SESN_STAGING_REGION_GROUP: 'asia-northeast',
      SESN_PRODUCTION_REGION_GROUP: 'asia-northeast',
      SESN_STAGING_DATABASE_MODE: 'session-pooler',
    },
  });
  assert.equal(result.status, 'DATABASE_CONNECTIVITY_FAILED');
  assert.ok(
    result.failures.includes(
      'all runtime region and database mode values must be supplied together',
    ),
  );
  assert.ok(result.failures.includes('invalid Staging database mode'));
});
