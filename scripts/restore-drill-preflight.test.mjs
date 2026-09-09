import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeStrictUtf8,
  evaluateRestorePreflight,
  parseRestorePreflightFactsBuffer,
} from './restore-drill-preflight.mjs';

function validFacts(overrides = {}) {
  return {
    version: 1,
    environment: 'Disposable',
    productionTarget: false,
    separateRestoreEnvironment: true,
    targetIdentityVerified: true,
    productionSecretsReused: false,
    databaseBackupRunLinked: true,
    storageBackupRunLinked: true,
    restorePointAlignment: 'PASS',
    targetDefaultAclNormalized: true,
    migrationBaselineRecorded: true,
    applicationSchemaBaselineRecorded: true,
    restoreCommandSingleTransaction: true,
    restoreCommandOnErrorStop: true,
    artifactCopyHashParity: 'NOT_APPLICABLE',
    customRoleCount: 0,
    roleReplayMode: 'intentional-skip-empty-custom-set',
    reservedRoleReplayPlanned: false,
    storageRestoreViaApiOrS3Planned: true,
    storageProtectDeleteDisablePlanned: false,
    falsePassGuardReady: true,
    secretFreeFacts: true,
    ...overrides,
  };
}

const readyDependencies = {
  lockfilePresent: true,
  typescriptBinaryPresent: true,
  packageManagerPinned: true,
};

function evaluate({
  facts = validFacts(),
  rolesText,
  schemaText,
  dataText,
  dependencyState,
} = {}) {
  return evaluateRestorePreflight({
    facts,
    rolesText:
      rolesText ??
      'ALTER ROLE "postgres" WITH SUPERUSER;\nALTER ROLE "anon" WITH NOLOGIN;',
    schemaText:
      schemaText ?? 'CREATE TABLE public.projects (id uuid PRIMARY KEY);',
    dataText: dataText ?? 'COPY public.projects (id) FROM stdin;\n\\.',
    dependencyState: dependencyState ?? readyDependencies,
  });
}

test('passes a safe empty-custom-role restore preflight', () => {
  const result = evaluate();
  assert.equal(result.status, 'RESTORE_PREFLIGHT_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.customRoleCountDiscovered, 0);
  assert.equal(result.reservedRoleCountDiscovered, 2);
  assert.equal(result.checks.storageManagedSqlAbsent, true);
  assert.equal(result.checks.dependencyReady, true);
});

test('passes a custom-only role replay when the discovered count matches', () => {
  const result = evaluate({
    facts: validFacts({
      customRoleCount: 1,
      roleReplayMode: 'custom-only',
    }),
    rolesText:
      'ALTER ROLE "postgres" WITH SUPERUSER;\nCREATE ROLE "ses_app_reader" NOLOGIN;',
  });
  assert.equal(result.status, 'RESTORE_PREFLIGHT_PASSED');
  assert.equal(result.customRoleCountDiscovered, 1);
  assert.equal(result.reservedRoleCountDiscovered, 1);
});

test('rejects Production target secret reuse and unverified target identity', () => {
  const result = evaluate({
    facts: validFacts({
      environment: 'Production',
      productionTarget: true,
      separateRestoreEnvironment: false,
      targetIdentityVerified: false,
      productionSecretsReused: true,
    }),
  });
  assert.equal(result.status, 'RESTORE_PREFLIGHT_FAILED');
  assert.ok(
    result.findings.includes('environment-must-be-disposable-or-staging'),
  );
  assert.ok(result.findings.includes('production-target-must-be-false'));
  assert.ok(
    result.findings.includes('separate-restore-environment-must-be-true'),
  );
  assert.ok(result.findings.includes('target-identity-verification-required'));
  assert.ok(result.findings.includes('production-secrets-reuse-must-be-false'));
});

test('rejects Storage managed schema and metadata references in SQL artifacts', () => {
  const result = evaluate({
    schemaText:
      'CREATE SCHEMA storage; CREATE TABLE storage.objects (id uuid);',
    dataText: 'COPY storage.buckets (id) FROM stdin;\n\\.',
  });
  assert.ok(result.findings.includes('storage-managed-sql-reference:schema'));
  assert.ok(result.findings.includes('storage-managed-sql-reference:data'));
  assert.equal(result.checks.storageManagedSqlAbsent, false);
});

test('ignores Storage names inside SQL comments', () => {
  const result = evaluate({
    schemaText:
      '-- storage.objects must not be restored here\nCREATE TABLE public.projects (id uuid);',
  });
  assert.equal(result.status, 'RESTORE_PREFLIGHT_PASSED');
});

test('rejects role count mismatch and unsafe replay mode', () => {
  const result = evaluate({
    facts: validFacts({
      customRoleCount: 0,
      roleReplayMode: 'custom-only',
      reservedRoleReplayPlanned: true,
    }),
    rolesText: 'CREATE ROLE "ses_app_reader" NOLOGIN;',
  });
  assert.ok(
    result.findings.includes('empty-custom-role-set-must-use-intentional-skip'),
  );
  assert.ok(result.findings.includes('reserved-role-replay-must-be-false'));
  assert.ok(
    result.findings.includes('custom-role-count-does-not-match-roles-artifact'),
  );
});

test('rejects missing dependency readiness before Application smoke', () => {
  const result = evaluate({
    dependencyState: {
      lockfilePresent: false,
      typescriptBinaryPresent: false,
      packageManagerPinned: false,
    },
  });
  assert.ok(result.findings.includes('pnpm-lockfile-required-before-restore'));
  assert.ok(
    result.findings.includes(
      'typescript-binary-required-before-application-smoke',
    ),
  );
  assert.ok(result.findings.includes('package-manager-pin-required'));
  assert.equal(result.checks.dependencyReady, false);
});

test('rejects BOM and malformed preflight facts JSON', () => {
  const bomBuffer = Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]);
  const bomResult = parseRestorePreflightFactsBuffer(bomBuffer);
  assert.ok(bomResult.findings.includes('facts-utf8-bom-prohibited'));

  const malformedResult = parseRestorePreflightFactsBuffer(
    Buffer.from('{not-json}', 'utf8'),
  );
  assert.ok(malformedResult.findings.includes('facts-json-invalid'));
});

test('rejects BOM and invalid UTF-8 in SQL artifacts', () => {
  const bomResult = decodeStrictUtf8(
    Buffer.from([0xef, 0xbb, 0xbf, 0x53, 0x45, 0x4c, 0x45, 0x43, 0x54]),
    'schema-sql',
  );
  assert.ok(bomResult.findings.includes('schema-sql-utf8-bom-prohibited'));

  const invalidResult = decodeStrictUtf8(Buffer.from([0xc3, 0x28]), 'data-sql');
  assert.ok(invalidResult.findings.includes('data-sql-strict-utf8-required'));
});

test('rejects unknown fact fields so secrets cannot be smuggled into the gate', () => {
  const result = evaluate({
    facts: {
      ...validFacts(),
      databaseUrl: 'must-not-be-accepted',
    },
  });
  assert.ok(result.findings.includes('unknown-field:databaseUrl'));
});
