import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareDefaultAclEntries,
  defaultAclProbeSql,
  evaluateLocalDockerTargetProbe,
  parseDatabaseProbeOutput,
  pg17SupabaseLocalDefaultAclBaseline,
  runLocalDockerTargetProbe,
} from './restore-target-db-probe.mjs';

const targetArgs = {
  environment: 'Disposable',
  containerName: 'supabase_db_sesn-ba008-restore-drill',
  requiredNameToken: 'restore-drill',
  containerRunning: true,
  imageName: 'public.ecr.aws/supabase/postgres:17.6.1',
};

const cleanDatabaseProbe = () => ({
  defaultAclEntries: pg17SupabaseLocalDefaultAclBaseline.map((entry) => ({
    ...entry,
  })),
  postgresMajorVersion: 17,
});

const unexpectedEntry = (grantee = 'anon') => ({
  ownerRole: 'postgres',
  schema: 'app',
  objectType: 'tables',
  grantee,
  privilege: 'SELECT',
  grantable: false,
});

test('default ACL probe SQL returns normalized tuple fields', () => {
  assert.match(defaultAclProbeSql, /pg_default_acl/u);
  assert.match(defaultAclProbeSql, /aclexplode/u);
  assert.match(defaultAclProbeSql, /'ownerRole'/u);
  assert.match(defaultAclProbeSql, /'objectType'/u);
  assert.match(defaultAclProbeSql, /acl\.grantee = 0 THEN 'PUBLIC'/u);
  assert.match(defaultAclProbeSql, /acl\.is_grantable/u);
  assert.match(defaultAclProbeSql, /anon/u);
  assert.match(defaultAclProbeSql, /authenticated/u);
  assert.match(defaultAclProbeSql, /service_role/u);
});

test('declares the exact clean PostgreSQL 17 Supabase local baseline', () => {
  assert.equal(pg17SupabaseLocalDefaultAclBaseline.length, 195);
  assert.ok(
    pg17SupabaseLocalDefaultAclBaseline.some(
      (entry) =>
        entry.ownerRole === 'postgres' &&
        entry.schema === 'public' &&
        entry.objectType === 'tables' &&
        entry.grantee === 'anon' &&
        entry.privilege === 'MAINTAIN' &&
        entry.grantable === false,
    ),
  );
});

test('parses secret-free database probe tuple JSON', () => {
  const payload = cleanDatabaseProbe();
  const result = parseDatabaseProbeOutput(`${JSON.stringify(payload)}\n`);

  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.value, payload);
});

test('rejects malformed database probe output and tuples', () => {
  assert.deepEqual(parseDatabaseProbeOutput('').findings, [
    'database-probe-output-required',
  ]);
  assert.deepEqual(parseDatabaseProbeOutput('not-json').findings, [
    'database-probe-json-output-required',
  ]);
  assert.deepEqual(
    parseDatabaseProbeOutput(
      JSON.stringify({
        defaultAclEntries: [{ ...unexpectedEntry(), grantable: 'false' }],
        postgresMajorVersion: 17,
      }),
    ).findings,
    ['database-probe-default-acl-tuple-invalid'],
  );
  assert.deepEqual(
    parseDatabaseProbeOutput(
      JSON.stringify({
        defaultAclEntries: [],
        postgresMajorVersion: '17',
      }),
    ).findings,
    ['database-probe-postgres-major-version-invalid'],
  );
  const duplicatedTuple = unexpectedEntry();
  assert.deepEqual(
    parseDatabaseProbeOutput(
      JSON.stringify({
        defaultAclEntries: [duplicatedTuple, duplicatedTuple],
        postgresMajorVersion: 17,
      }),
    ).findings,
    ['database-probe-default-acl-tuples-must-be-unique'],
  );
});

test('accepts the exact clean PostgreSQL 17 Supabase baseline', () => {
  const result = evaluateLocalDockerTargetProbe({
    ...targetArgs,
    databaseProbe: cleanDatabaseProbe(),
  });

  assert.equal(result.status, 'RESTORE_TARGET_PROBE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.probe.productionTarget, false);
  assert.equal(result.probe.targetIdentityVerified, true);
  assert.equal(result.probe.targetDefaultAclNormalized, true);
  assert.equal(result.probe.riskyDefaultAclEntryCount, 0);
  assert.equal(result.probe.actualDefaultAclEntryCount, 195);
  assert.equal(result.probe.expectedDefaultAclEntryCount, 195);
  assert.equal(result.probe.unexpectedDefaultAclEntryCount, 0);
  assert.equal(result.probe.missingDefaultAclEntryCount, 0);
  assert.equal(result.probe.defaultAclBaselineMatched, true);
  assert.equal(result.probe.secretFreeProbe, true);
});

test('fails when the baseline has one additional unexpected ACL', () => {
  const databaseProbe = cleanDatabaseProbe();
  databaseProbe.defaultAclEntries.push(unexpectedEntry());
  const result = evaluateLocalDockerTargetProbe({
    ...targetArgs,
    databaseProbe,
  });

  assert.equal(result.status, 'RESTORE_TARGET_PROBE_FAILED');
  assert.deepEqual(result.findings, ['target-default-acl-unexpected-entries']);
  assert.equal(result.probe.targetIdentityVerified, true);
  assert.equal(result.probe.targetDefaultAclNormalized, false);
  assert.equal(result.probe.riskyDefaultAclEntryCount, 1);
  assert.equal(result.probe.actualDefaultAclEntryCount, 196);
  assert.equal(result.probe.unexpectedDefaultAclEntryCount, 1);
  assert.equal(result.probe.missingDefaultAclEntryCount, 0);
});

test('fails when one required baseline ACL is missing', () => {
  const databaseProbe = cleanDatabaseProbe();
  databaseProbe.defaultAclEntries.pop();
  const result = evaluateLocalDockerTargetProbe({
    ...targetArgs,
    databaseProbe,
  });

  assert.equal(result.status, 'RESTORE_TARGET_PROBE_FAILED');
  assert.deepEqual(result.findings, [
    'target-default-acl-baseline-missing-entries',
  ]);
  assert.equal(result.probe.targetIdentityVerified, true);
  assert.equal(result.probe.riskyDefaultAclEntryCount, 0);
  assert.equal(result.probe.actualDefaultAclEntryCount, 194);
  assert.equal(result.probe.unexpectedDefaultAclEntryCount, 0);
  assert.equal(result.probe.missingDefaultAclEntryCount, 1);
});

for (const grantee of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
  test(`fails on an unexpected ${grantee} ACL`, () => {
    const databaseProbe = cleanDatabaseProbe();
    databaseProbe.defaultAclEntries.push(unexpectedEntry(grantee));
    const result = evaluateLocalDockerTargetProbe({
      ...targetArgs,
      databaseProbe,
    });

    assert.equal(result.status, 'RESTORE_TARGET_PROBE_FAILED');
    assert.ok(
      result.findings.includes('target-default-acl-unexpected-entries'),
    );
    assert.equal(result.probe.unexpectedDefaultAclEntryCount, 1);
  });
}

test('fails when grantable differs from the baseline', () => {
  const databaseProbe = cleanDatabaseProbe();
  databaseProbe.defaultAclEntries[0] = {
    ...databaseProbe.defaultAclEntries[0],
    grantable: true,
  };
  const result = evaluateLocalDockerTargetProbe({
    ...targetArgs,
    databaseProbe,
  });

  assert.equal(result.status, 'RESTORE_TARGET_PROBE_FAILED');
  assert.deepEqual(result.findings, [
    'target-default-acl-unexpected-entries',
    'target-default-acl-baseline-missing-entries',
  ]);
  assert.equal(result.probe.actualDefaultAclEntryCount, 195);
  assert.equal(result.probe.unexpectedDefaultAclEntryCount, 1);
  assert.equal(result.probe.missingDefaultAclEntryCount, 1);
});

test('does not pass a different tuple set with the same 195 count', () => {
  const databaseProbe = cleanDatabaseProbe();
  databaseProbe.defaultAclEntries[0] = unexpectedEntry('PUBLIC');
  const comparison = compareDefaultAclEntries(databaseProbe.defaultAclEntries);
  const result = evaluateLocalDockerTargetProbe({
    ...targetArgs,
    databaseProbe,
  });

  assert.equal(comparison.actualDefaultAclEntryCount, 195);
  assert.equal(comparison.defaultAclBaselineMatched, false);
  assert.equal(comparison.unexpectedDefaultAclEntryCount, 1);
  assert.equal(comparison.missingDefaultAclEntryCount, 1);
  assert.equal(result.status, 'RESTORE_TARGET_PROBE_FAILED');
  assert.deepEqual(result.findings, [
    'target-default-acl-unexpected-entries',
    'target-default-acl-baseline-missing-entries',
  ]);
});

test('fails closed on an unexpected PostgreSQL major version', () => {
  const result = evaluateLocalDockerTargetProbe({
    ...targetArgs,
    databaseProbe: {
      ...cleanDatabaseProbe(),
      postgresMajorVersion: 16,
    },
  });

  assert.equal(result.status, 'RESTORE_TARGET_PROBE_FAILED');
  assert.deepEqual(result.findings, ['postgres-major-version-17-required']);
  assert.equal(result.probe.targetIdentityVerified, true);
  assert.equal(result.probe.targetDefaultAclNormalized, false);
  assert.equal(result.probe.defaultAclBaselineMatched, false);
});

test('keeps target identity separate from ACL posture failures', () => {
  const databaseProbe = cleanDatabaseProbe();
  databaseProbe.defaultAclEntries.push(unexpectedEntry());
  const result = evaluateLocalDockerTargetProbe({
    ...targetArgs,
    databaseProbe,
  });

  assert.equal(result.probe.productionTarget, false);
  assert.equal(result.probe.separateRestoreEnvironment, true);
  assert.equal(result.probe.targetIdentityVerified, true);
  assert.equal(result.probe.targetDefaultAclNormalized, false);
  assert.equal(result.probe.databaseReachable, true);
});

test('fails closed on target-name and image hazards without changing ACL posture', () => {
  const result = evaluateLocalDockerTargetProbe({
    ...targetArgs,
    containerName: 'supabase_db_sesn-development',
    imageName: 'postgres:17',
    databaseProbe: cleanDatabaseProbe(),
  });

  assert.equal(result.status, 'RESTORE_TARGET_PROBE_FAILED');
  assert.ok(result.findings.includes('restore-target-name-token-mismatch'));
  assert.ok(
    result.findings.includes('restore-target-must-use-supabase-postgres-image'),
  );
  assert.equal(result.probe.targetIdentityVerified, false);
  assert.equal(result.probe.targetDefaultAclNormalized, true);
});

test('fails closed when Docker inspection fails', async () => {
  let loggedOutput = '';
  await assert.rejects(
    runLocalDockerTargetProbe({
      environment: targetArgs.environment,
      containerName: targetArgs.containerName,
      requiredNameToken: targetArgs.requiredNameToken,
      runCommand: () => ({ status: 1, stdout: '', stderr: 'unavailable' }),
      log: (output) => {
        loggedOutput = output;
      },
    }),
    /Restore target probe failed/u,
  );

  const result = JSON.parse(loggedOutput);
  assert.equal(result.status, 'RESTORE_TARGET_PROBE_FAILED');
  assert.ok(result.findings.includes('docker-target-inspection-failed'));
  assert.equal(result.probe.targetIdentityVerified, false);
});

test('fails closed when the database probe command fails', async () => {
  let loggedOutput = '';
  const runCommand = (_command, args) => {
    if (args[0] === 'inspect' && args[2] === '{{.State.Running}}') {
      return { status: 0, stdout: 'true\n', stderr: '' };
    }
    if (args[0] === 'inspect' && args[2] === '{{.Config.Image}}') {
      return {
        status: 0,
        stdout: 'public.ecr.aws/supabase/postgres:17.6.1\n',
        stderr: '',
      };
    }
    return { status: 1, stdout: '', stderr: 'psql failed' };
  };

  await assert.rejects(
    runLocalDockerTargetProbe({
      environment: targetArgs.environment,
      containerName: targetArgs.containerName,
      requiredNameToken: targetArgs.requiredNameToken,
      runCommand,
      log: (output) => {
        loggedOutput = output;
      },
    }),
    /Restore target probe failed/u,
  );

  const result = JSON.parse(loggedOutput);
  assert.equal(result.status, 'RESTORE_TARGET_PROBE_FAILED');
  assert.ok(result.findings.includes('database-probe-command-failed'));
  assert.equal(result.probe.databaseReachable, false);
  assert.equal(result.probe.targetIdentityVerified, false);
});
