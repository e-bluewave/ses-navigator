import assert from 'node:assert/strict';
import test from 'node:test';

import { validateStorageBackupPolicy } from './check-storage-backup-policy.mjs';

const policy = {
  version: 1,
  scope: 'supabase-storage-object-backup',
  source: {
    protocol: 's3-compatible',
    includeAllFileBuckets: true,
    preserveBucketAndObjectKey: true,
    sourceVersioningAvailable: false,
  },
  schedule: {
    maximumIntervalHours: 24,
    retentionDays: 35,
  },
  destination: {
    offsiteRequired: true,
    sameSupabaseProjectAllowed: false,
    repositoryAllowed: false,
    githubActionsArtifactLongTermAllowed: false,
    versioningRequired: true,
    encryptionAtRestRequired: true,
  },
  transfer: {
    tlsRequired: true,
    inventoryRequired: true,
    checksumOrEquivalentIntegrityRequired: true,
    deletePropagationAllowed: false,
  },
  coordination: {
    databaseMetadataBackupRequired: true,
    databaseBackupTrackedBy: 'BA-006',
    restoreDrillTrackedBy: 'BA-008',
  },
  security: {
    dedicatedBackupCredentialRequired: true,
    credentialInRepositoryAllowed: false,
    credentialInLogsAllowed: false,
    objectDataInRepositoryAllowed: false,
  },
};

test('accepts the reviewed storage backup policy', () => {
  const result = validateStorageBackupPolicy(policy);
  assert.equal(result.status, 'STORAGE_BACKUP_POLICY_PASSED');
  assert.deepEqual(result.failures, []);
});

test('rejects incomplete bucket coverage and loss of object keys', () => {
  const result = validateStorageBackupPolicy({
    ...policy,
    source: {
      ...policy.source,
      includeAllFileBuckets: false,
      preserveBucketAndObjectKey: false,
      sourceVersioningAvailable: true,
    },
  });
  assert.ok(result.failures.includes('all file buckets must be included'));
  assert.ok(result.failures.includes('bucket and object key must be preserved'));
  assert.ok(result.failures.includes('source versioning must not be assumed'));
});

test('rejects weak destination retention and delete propagation', () => {
  const result = validateStorageBackupPolicy({
    ...policy,
    schedule: { maximumIntervalHours: 48, retentionDays: 7 },
    destination: {
      ...policy.destination,
      sameSupabaseProjectAllowed: true,
      repositoryAllowed: true,
      versioningRequired: false,
      encryptionAtRestRequired: false,
    },
    transfer: {
      ...policy.transfer,
      deletePropagationAllowed: true,
    },
  });
  assert.ok(result.failures.includes('backup interval must be between 1 and 24 hours'));
  assert.ok(result.failures.includes('backup retention must be at least 35 days'));
  assert.ok(
    result.failures.includes('same Supabase project destination must be prohibited'),
  );
  assert.ok(result.failures.includes('repository backup storage must be prohibited'));
  assert.ok(result.failures.includes('destination versioning is required'));
  assert.ok(result.failures.includes('destination encryption at rest is required'));
  assert.ok(result.failures.includes('source deletes must not automatically propagate'));
});

test('requires integrity, DB coordination and safe credentials', () => {
  const result = validateStorageBackupPolicy({
    ...policy,
    transfer: {
      tlsRequired: false,
      inventoryRequired: false,
      checksumOrEquivalentIntegrityRequired: false,
      deletePropagationAllowed: false,
    },
    coordination: {
      databaseMetadataBackupRequired: false,
      databaseBackupTrackedBy: 'none',
      restoreDrillTrackedBy: 'none',
    },
    security: {
      dedicatedBackupCredentialRequired: false,
      credentialInRepositoryAllowed: true,
      credentialInLogsAllowed: true,
      objectDataInRepositoryAllowed: true,
    },
  });
  assert.ok(result.failures.includes('TLS transfer is required'));
  assert.ok(result.failures.includes('object inventory is required'));
  assert.ok(result.failures.includes('object integrity verification is required'));
  assert.ok(
    result.failures.includes('database metadata backup coordination is required'),
  );
  assert.ok(result.failures.includes('database backup must be tracked by BA-006'));
  assert.ok(result.failures.includes('restore drill must be tracked by BA-008'));
  assert.ok(result.failures.includes('dedicated backup credential is required'));
  assert.ok(result.failures.includes('backup credential must not be allowed in repository'));
  assert.ok(result.failures.includes('backup credential must not be allowed in logs'));
  assert.ok(result.failures.includes('storage object data must not be allowed in repository'));
});
