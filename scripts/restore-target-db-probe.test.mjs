import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultAclProbeSql,
  evaluateLocalDockerTargetProbe,
  parseDatabaseProbeOutput,
} from './restore-target-db-probe.mjs';

test('default ACL probe SQL checks risky application principals', () => {
  assert.match(defaultAclProbeSql, /pg_default_acl/u);
  assert.match(defaultAclProbeSql, /aclexplode/u);
  assert.match(defaultAclProbeSql, /anon/u);
  assert.match(defaultAclProbeSql, /authenticated/u);
  assert.match(defaultAclProbeSql, /service_role/u);
});

test('parses secret-free database probe JSON', () => {
  const result = parseDatabaseProbeOutput(
    '{"riskyDefaultAclEntryCount":0,"postgresMajorVersion":17}\n',
  );
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.value, {
    riskyDefaultAclEntryCount: 0,
    postgresMajorVersion: 17,
  });
});

test('rejects malformed database probe output', () => {
  assert.deepEqual(parseDatabaseProbeOutput('').findings, [
    'database-probe-output-required',
  ]);
  assert.deepEqual(parseDatabaseProbeOutput('not-json').findings, [
    'database-probe-json-output-required',
  ]);
});

test('accepts a running disposable Supabase restore target with normalized ACL', () => {
  const result = evaluateLocalDockerTargetProbe({
    environment: 'Disposable',
    containerName: 'supabase_db_sesn-ba008-restore-drill',
    requiredNameToken: 'restore-drill',
    containerRunning: true,
    imageName: 'public.ecr.aws/supabase/postgres:17.6.1',
    databaseProbe: {
      riskyDefaultAclEntryCount: 0,
      postgresMajorVersion: 17,
    },
  });

  assert.equal(result.status, 'RESTORE_TARGET_PROBE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.probe.productionTarget, false);
  assert.equal(result.probe.targetIdentityVerified, true);
  assert.equal(result.probe.targetDefaultAclNormalized, true);
  assert.equal(result.probe.secretFreeProbe, true);
});

test('fails closed on target-name, image and default ACL hazards', () => {
  const result = evaluateLocalDockerTargetProbe({
    environment: 'Disposable',
    containerName: 'supabase_db_sesn-development',
    requiredNameToken: 'restore-drill',
    containerRunning: true,
    imageName: 'postgres:17',
    databaseProbe: {
      riskyDefaultAclEntryCount: 3,
      postgresMajorVersion: 17,
    },
  });

  assert.equal(result.status, 'RESTORE_TARGET_PROBE_FAILED');
  assert.equal(result.complete, false);
  assert.ok(result.findings.includes('restore-target-name-token-mismatch'));
  assert.ok(
    result.findings.includes('restore-target-must-use-supabase-postgres-image'),
  );
  assert.ok(result.findings.includes('target-default-acl-not-normalized'));
  assert.equal(result.probe.targetIdentityVerified, false);
  assert.equal(result.probe.targetDefaultAclNormalized, false);
});
