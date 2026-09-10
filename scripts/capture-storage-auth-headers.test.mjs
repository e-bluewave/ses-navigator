import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStorageAuthorizationHeaders } from './capture-storage-backup.mjs';

test('new sb_secret key uses apikey header only', () => {
  const key = 'sb_secret_test_value';
  const headers = buildStorageAuthorizationHeaders(key);
  assert.deepEqual(headers, { apikey: key });
  assert.equal('Authorization' in headers, false);
});

test('legacy service_role JWT keeps Bearer compatibility', () => {
  const key = 'eyJlegacy-service-role-test';
  const headers = buildStorageAuthorizationHeaders(key);
  assert.deepEqual(headers, {
    apikey: key,
    Authorization: `Bearer ${key}`,
  });
});

test('blank Storage credential is rejected', () => {
  assert.throws(
    () => buildStorageAuthorizationHeaders(''),
    /credential is required/u,
  );
});
