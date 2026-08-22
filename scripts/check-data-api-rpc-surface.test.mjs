import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expectedServiceRoleRpcs,
  reviewedDormantAuthenticatedRpcs,
  validateDataApiRpcSurface,
} from './check-data-api-rpc-surface.mjs';

const apiFiles = [
  {
    name: 'repository.ts',
    source:
      "request(token, '/rpc/list_records', {}); this.rpc(token, 'has_permission', {});",
  },
];

const reviewedGrants = [
  'list_records',
  'has_permission',
  ...reviewedDormantAuthenticatedRpcs,
]
  .map(
    (name) =>
      `revoke all on function public.${name}() from public, anon, authenticated;\n` +
      `grant execute on function public.${name}() to authenticated;`,
  )
  .join('\n');

const serviceGrant =
  `revoke all on function public.${expectedServiceRoleRpcs[0]}() ` +
  'from public, anon, authenticated, service_role;\n' +
  `grant execute on function public.${expectedServiceRoleRpcs[0]}() to service_role;`;

test('accepts the API RPCs and reviewed role boundaries', () => {
  const result = validateDataApiRpcSurface({
    apiFiles,
    migrationFiles: [
      { name: '001.sql', source: `${reviewedGrants}\n${serviceGrant}` },
    ],
  });

  assert.equal(result.status, 'DATA_API_RPC_SURFACE_PASSED');
  assert.deepEqual(result.failures, []);
});

test('rejects an API RPC without an authenticated grant', () => {
  const result = validateDataApiRpcSurface({
    apiFiles: [
      ...apiFiles,
      { name: 'new.ts', source: "request(token, '/rpc/ungranted_rpc', {});" },
    ],
    migrationFiles: [
      { name: '001.sql', source: `${reviewedGrants}\n${serviceGrant}` },
    ],
  });

  assert.match(result.failures.join('\n'), /missing: ungranted_rpc/);
});

test('rejects an unused authenticated RPC', () => {
  const result = validateDataApiRpcSurface({
    apiFiles,
    migrationFiles: [
      {
        name: '001.sql',
        source:
          `${reviewedGrants}\n${serviceGrant}\n` +
          'grant execute on function public.unused_rpc() to authenticated;',
      },
    ],
  });

  assert.match(result.failures.join('\n'), /excess: unused_rpc/);
});

test('rejects public or anonymous RPC execution', () => {
  const result = validateDataApiRpcSurface({
    apiFiles,
    migrationFiles: [
      {
        name: '001.sql',
        source:
          `${reviewedGrants}\n${serviceGrant}\n` +
          'grant execute on function public.list_records() to public, anon;',
      },
    ],
  });

  assert.match(result.failures.join('\n'), /anon/);
  assert.match(result.failures.join('\n'), /PUBLIC/);
});

test('rejects an extra service_role RPC', () => {
  const result = validateDataApiRpcSurface({
    apiFiles,
    migrationFiles: [
      {
        name: '001.sql',
        source:
          `${reviewedGrants}\n${serviceGrant}\n` +
          'grant execute on function public.admin_everything() to service_role;',
      },
    ],
  });

  assert.match(result.failures.join('\n'), /service_role.*excess/);
});

test('applies a later schema-wide revoke before later grants', () => {
  const result = validateDataApiRpcSurface({
    apiFiles,
    migrationFiles: [
      {
        name: '001.sql',
        source: 'grant execute on function public.old() to anon;',
      },
      {
        name: '002.sql',
        source:
          'revoke execute on all functions in schema public from public, anon, authenticated, service_role;\n' +
          `${reviewedGrants}\n${serviceGrant}`,
      },
    ],
  });

  assert.equal(result.status, 'DATA_API_RPC_SURFACE_PASSED');
});
