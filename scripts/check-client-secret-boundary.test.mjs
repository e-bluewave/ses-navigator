import assert from 'node:assert/strict';
import test from 'node:test';
import { validateClientSecretBoundary } from './check-client-secret-boundary.mjs';

test('accepts browser-safe Supabase configuration', () => {
  const result = validateClientSecretBoundary([
    {
      name: 'auth-client.ts',
      source:
        'import.meta.env.VITE_SUPABASE_URL;\n' +
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;\n' +
        'import.meta.env.VITE_SUPABASE_ANON_KEY;',
    },
  ]);

  assert.equal(result.status, 'CLIENT_SECRET_BOUNDARY_PASSED');
  assert.deepEqual(result.findings, []);
});

test('rejects Service Role environment variables in client files', () => {
  const result = validateClientSecretBoundary([
    {
      name: '.env.production',
      source: 'VITE_SUPABASE_SERVICE_ROLE_KEY=not-a-real-key',
    },
  ]);

  assert.equal(result.status, 'CLIENT_SECRET_BOUNDARY_FAILED');
  assert.ok(
    result.findings.some(
      (finding) => finding.rule === 'service-role-environment-variable',
    ),
  );
});

test('rejects Supabase secret key values from built assets', () => {
  const result = validateClientSecretBoundary([
    { name: 'dist/assets/index.js', source: 'const key="sb_secret_example";' },
  ]);

  assert.deepEqual(result.findings, [
    {
      file: 'dist/assets/index.js',
      line: 1,
      rule: 'supabase-secret-key-value',
    },
  ]);
});

test('rejects service_role claims in browser code', () => {
  const result = validateClientSecretBoundary([
    { name: 'src/config.ts', source: "const role = 'service_role';" },
  ]);

  assert.ok(
    result.findings.some(
      (finding) => finding.rule === 'service-role-jwt-claim',
    ),
  );
});

test('reports file and line without returning matched secret text', () => {
  const result = validateClientSecretBoundary([
    {
      name: 'dist/index.js',
      source: 'safe();\nconst key = "sb_secret_do_not_log";',
    },
  ]);

  assert.equal(result.findings[0].line, 2);
  assert.equal(JSON.stringify(result).includes('do_not_log'), false);
});
