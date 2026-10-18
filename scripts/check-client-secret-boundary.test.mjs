import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  runClientSecretBoundaryCheck,
  validateClientSecretBoundary,
} from './check-client-secret-boundary.mjs';

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

test('rejects Microsoft Graph client secret configuration in browser files', () => {
  const result = validateClientSecretBoundary([
    {
      name: 'src/config.ts',
      source: 'const secret = import.meta.env.MICROSOFT_GRAPH_CLIENT_SECRET;',
    },
  ]);

  assert.ok(
    result.findings.some(
      (finding) =>
        finding.rule === 'microsoft-graph-client-secret-environment-variable',
    ),
  );
});

test('rejects mail and deployment-protection credentials without returning values', () => {
  for (const name of [
    'VITE_SMTP_PASSWORD',
    'SMTP_PASSWORD',
    'VITE_VERCEL_OIDC_TOKEN',
    'VERCEL_AUTOMATION_BYPASS_SECRET',
  ]) {
    const result = validateClientSecretBoundary([
      { name: 'dist/client.js', source: `${name}="fixture-sensitive-value";` },
    ]);
    assert.equal(result.status, 'CLIENT_SECRET_BOUNDARY_FAILED');
    assert.equal(
      JSON.stringify(result).includes('fixture-sensitive-value'),
      false,
    );
  }
});

test('fixture auth code may live only in the isolated browser test directory', () => {
  const fixture = {
    name: 'apps/web/tests/browser/fixture/main.tsx',
    source: 'window.fixtureSendCount = 0;',
  };
  assert.equal(
    validateClientSecretBoundary([fixture]).status,
    'CLIENT_SECRET_BOUNDARY_PASSED',
  );
  assert.equal(
    validateClientSecretBoundary([
      { ...fixture, name: 'apps/web/src/main.tsx' },
    ]).status,
    'CLIENT_SECRET_BOUNDARY_FAILED',
  );
  assert.equal(
    validateClientSecretBoundary([
      { ...fixture, name: 'apps/web/dist/assets/client.js' },
    ]).status,
    'CLIENT_SECRET_BOUNDARY_FAILED',
  );
});

test('all public password and token names are rejected with no matching values', () => {
  for (const name of [
    'VITE_ACCESS_TOKEN',
    'VITE_REFRESH_TOKEN',
    'VITE_TEST_PASSWORD',
  ]) {
    const result = validateClientSecretBoundary([
      {
        name: 'dist/assets/client.js.map',
        source: `${name}="fixture-sensitive";`,
      },
    ]);
    assert.equal(result.status, 'CLIENT_SECRET_BOUNDARY_FAILED');
    assert.equal(JSON.stringify(result).includes('fixture-sensitive'), false);
  }
});

test('tree scan includes source maps and logs locations instead of secret fixture values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sesn-client-boundary-'));
  const logs = [];
  try {
    await writeFile(
      join(directory, 'client.js.map'),
      '{"sourcesContent":["sb_secret_fixtureSensitive"]}',
    );
    await assert.rejects(
      runClientSecretBoundaryCheck({
        webPath: directory,
        log: (line) => logs.push(line),
      }),
      /guard failed/u,
    );
    assert.match(logs.join(''), /supabase-secret-key-value/u);
    assert.doesNotMatch(logs.join(''), /sb_secret_fixtureSensitive/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('encoded legacy service-role JWTs are rejected after bundling without exposing the token', () => {
  const token = (role) =>
    `e30fixture.${Buffer.from(JSON.stringify({ ref: 'fixture-project', role })).toString('base64url')}.fixtureSignature`;
  const denied = token('service_role');
  const result = validateClientSecretBoundary([
    { name: 'dist/assets/client.js', source: `const key="${denied}"` },
  ]);
  assert.equal(result.status, 'CLIENT_SECRET_BOUNDARY_FAILED');
  assert.equal(result.findings[0].rule, 'encoded-service-role-jwt');
  assert.equal(JSON.stringify(result).includes(denied), false);
  assert.equal(
    validateClientSecretBoundary([
      { name: 'dist/assets/client.js', source: `const key="${token('anon')}"` },
    ]).status,
    'CLIENT_SECRET_BOUNDARY_PASSED',
  );
});
