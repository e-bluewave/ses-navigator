import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDatabaseBackupPolicy } from './check-database-backup-policy.mjs';

const policy = {
  version: 2,
  scope: 'database-logical-backup',
  method: 'supabase-cli-db-dump',
  frequencyHours: 24,
  retentionDays: 35,
  connection: {
    mode: 'direct-or-session-pooler',
    transactionPoolerAllowed: false,
  },
  artifacts: {
    roles: true,
    schema: true,
    data: true,
    dataUseCopy: true,
    supabaseManagedSchemasExcluded: true,
    storageManagedSchemaExcluded: true,
    excludedDataObjects: [
      'storage.buckets',
      'storage.objects',
      'storage.buckets_vectors',
      'storage.vector_indexes',
    ],
  },
  destination: {
    offsiteRequired: true,
    repositoryAllowed: false,
    sameSupabaseProjectAllowed: false,
    longTermGitHubActionsArtifactAllowed: false,
  },
  encryption: {
    inTransit: 'tls',
    atRestRequired: true,
  },
  security: {
    databaseUrlInLogsAllowed: false,
    databasePasswordInRepositoryAllowed: false,
    backupContainsSecretsReviewRequired: true,
  },
  verification: {
    manifestRequired: true,
    checksumRequired: true,
    backupSetStartTimestampRequired: true,
    migrationBaselineRequired: true,
    applicationSchemaBaselineRequired: true,
    recoveryPointUsesBackupSetStart: true,
    strictUtf8NoBomEvidenceRequired: true,
    restoreDrillTrackedBy: 'BA-008',
  },
};

test('accepts the reviewed logical backup policy', () => {
  const result = validateDatabaseBackupPolicy(policy);
  assert.equal(result.status, 'DATABASE_BACKUP_POLICY_PASSED');
  assert.deepEqual(result.failures, []);
});

test('rejects transaction pooler and repository storage', () => {
  const result = validateDatabaseBackupPolicy({
    ...policy,
    connection: { ...policy.connection, transactionPoolerAllowed: true },
    destination: { ...policy.destination, repositoryAllowed: true },
  });
  assert.ok(
    result.failures.includes(
      'transaction pooler must not be allowed for logical backup',
    ),
  );
  assert.ok(
    result.failures.includes('repository backup storage must be prohibited'),
  );
});

test('rejects a backup interval longer than 24 hours and short retention', () => {
  const result = validateDatabaseBackupPolicy({
    ...policy,
    frequencyHours: 48,
    retentionDays: 7,
  });
  assert.ok(
    result.failures.includes('backup frequency must be between 1 and 24 hours'),
  );
  assert.ok(
    result.failures.includes('backup retention must be at least 35 days'),
  );
});

test('requires dump artifacts COPY mode and managed-schema exclusions', () => {
  const result = validateDatabaseBackupPolicy({
    ...policy,
    artifacts: {
      roles: false,
      schema: true,
      data: true,
      dataUseCopy: false,
      supabaseManagedSchemasExcluded: false,
      storageManagedSchemaExcluded: false,
      excludedDataObjects: [],
    },
  });
  assert.ok(
    result.failures.includes(
      'roles, schema and data backup artifacts are required',
    ),
  );
  assert.ok(result.failures.includes('data backup must use COPY mode'));
  assert.ok(
    result.failures.includes(
      'Supabase managed schemas must be excluded from logical dump',
    ),
  );
  assert.ok(
    result.failures.includes(
      'Storage managed schema must be excluded from logical dump',
    ),
  );
  for (const objectName of [
    'storage.buckets',
    'storage.objects',
    'storage.buckets_vectors',
    'storage.vector_indexes',
  ]) {
    assert.ok(
      result.failures.includes(
        `required data exclusion missing: ${objectName}`,
      ),
    );
  }
});

test('requires recovery metadata and BA-008 restore tracking', () => {
  const result = validateDatabaseBackupPolicy({
    ...policy,
    verification: {
      manifestRequired: false,
      checksumRequired: false,
      backupSetStartTimestampRequired: false,
      migrationBaselineRequired: false,
      applicationSchemaBaselineRequired: false,
      recoveryPointUsesBackupSetStart: false,
      strictUtf8NoBomEvidenceRequired: false,
      restoreDrillTrackedBy: 'none',
    },
  });
  assert.ok(result.failures.includes('backup manifest is required'));
  assert.ok(result.failures.includes('backup checksum is required'));
  assert.ok(result.failures.includes('backup set start timestamp is required'));
  assert.ok(result.failures.includes('migration baseline is required'));
  assert.ok(
    result.failures.includes('application schema baseline is required'),
  );
  assert.ok(
    result.failures.includes(
      'backup set start must define the conservative recovery point',
    ),
  );
  assert.ok(
    result.failures.includes(
      'database backup evidence must use UTF-8 without BOM',
    ),
  );
  assert.ok(
    result.failures.includes('restore drill must be tracked by BA-008'),
  );
});

test('requires encryption and safe secret handling', () => {
  const result = validateDatabaseBackupPolicy({
    ...policy,
    encryption: { inTransit: 'plain', atRestRequired: false },
    security: {
      databaseUrlInLogsAllowed: true,
      databasePasswordInRepositoryAllowed: true,
      backupContainsSecretsReviewRequired: false,
    },
  });
  assert.equal(result.status, 'DATABASE_BACKUP_POLICY_FAILED');
  assert.ok(result.failures.includes('backup transfer must require TLS'));
  assert.ok(
    result.failures.includes(
      'backup destination must require encryption at rest',
    ),
  );
  assert.ok(
    result.failures.includes('database URL must not be allowed in logs'),
  );
  assert.ok(
    result.failures.includes(
      'database password must not be allowed in repository',
    ),
  );
  assert.ok(
    result.failures.includes('backup secret-content review must be required'),
  );
});
