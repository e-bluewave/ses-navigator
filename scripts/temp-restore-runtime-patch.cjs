const fs = require('node:fs');

const sourcePath = 'scripts/restore-drill-local-run.mjs';
let source = fs.readFileSync(sourcePath, 'utf8');

if (!source.includes('const requiredRuntimeVariables = [')) {
  const anchor = 'const minuteMilliseconds = 60_000;\n';
  if (!source.includes(anchor)) throw new Error('constants anchor missing');
  source = source.replace(
    anchor,
    `${anchor}const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);\nconst requiredRuntimeVariables = [\n  'SESN_RESTORE_STORAGE_URL',\n  'SESN_RESTORE_STORAGE_SERVICE_ROLE_KEY',\n  'SESN_SUPABASE_URL',\n  'SESN_SUPABASE_PUBLISHABLE_KEY',\n  'SESN_SUPABASE_SECRET_KEY',\n  'SESN_TEST_EMAIL',\n  'SESN_TEST_PASSWORD',\n  'SESN_TEST_USER_A_EMAIL',\n  'SESN_TEST_USER_A_PASSWORD',\n  'SESN_TEST_USER_B_EMAIL',\n  'SESN_TEST_USER_B_PASSWORD',\n];\n`,
  );
}

if (!source.includes('export function validateLocalRestoreRuntimeEnvironment')) {
  const anchor = 'export function calculateRestoreTimeline({';
  if (!source.includes(anchor)) throw new Error('timeline anchor missing');
  const addition = `export function validateLocalRestoreRuntimeEnvironment(env = {}) {\n  const findings = [];\n  for (const name of requiredRuntimeVariables) {\n    if (!nonBlankString(env[name])) findings.push(\`missing-runtime-variable:\${name}\`);\n  }\n  if (findings.length > 0) {\n    return {\n      status: 'LOCAL_RESTORE_RUNTIME_ENV_FAILED',\n      complete: false,\n      findings,\n    };\n  }\n\n  const supabaseUrl = parseLoopbackUrl(\n    env.SESN_SUPABASE_URL,\n    'SESN_SUPABASE_URL',\n    findings,\n  );\n  const storageUrl = parseLoopbackUrl(\n    env.SESN_RESTORE_STORAGE_URL,\n    'SESN_RESTORE_STORAGE_URL',\n    findings,\n  );\n  if (supabaseUrl && storageUrl && supabaseUrl.origin !== storageUrl.origin) {\n    findings.push('storage-and-supabase-origin-must-match');\n  }\n  if (env.SESN_SUPABASE_SECRET_KEY.startsWith('sb_publishable_')) {\n    findings.push('supabase-secret-key-must-not-be-publishable');\n  }\n\n  return {\n    status:\n      findings.length === 0\n        ? 'LOCAL_RESTORE_RUNTIME_ENV_PASSED'\n        : 'LOCAL_RESTORE_RUNTIME_ENV_FAILED',\n    complete: findings.length === 0,\n    findings,\n  };\n}\n\n`;
  source = source.replace(anchor, `${addition}${anchor}`);
}

if (!source.includes('const runtimeResult = validateLocalRestoreRuntimeEnvironment(env);')) {
  const anchor = "  const repoRoot = resolve(facts.repoRoot ?? '.');";
  if (!source.includes(anchor)) throw new Error('repo root anchor missing');
  source = source.replace(
    anchor,
    `  const runtimeResult = validateLocalRestoreRuntimeEnvironment(env);\n  if (!runtimeResult.complete) {\n    throw new Error(\n      \`Local restore runtime preflight failed (\${runtimeResult.findings.length})\`,\n    );\n  }\n\n${anchor}`,
  );
}

source = source.replace(
  `        SUPABASE_URL: env.SUPABASE_URL ?? env.SESN_SUPABASE_URL,\n        SUPABASE_ANON_KEY:\n          env.SUPABASE_ANON_KEY ?? env.SESN_SUPABASE_PUBLISHABLE_KEY,`,
  `        SUPABASE_URL: env.SESN_SUPABASE_URL,\n        SUPABASE_ANON_KEY: env.SESN_SUPABASE_PUBLISHABLE_KEY,`,
);

if (!source.includes('function parseLoopbackUrl(value, field, findings)')) {
  const anchor = 'function buildEvidenceNotes(userNotes) {';
  if (!source.includes(anchor)) throw new Error('helper anchor missing');
  const addition = `function parseLoopbackUrl(value, field, findings) {\n  try {\n    const url = new URL(value);\n    if (!['http:', 'https:'].includes(url.protocol)) {\n      findings.push(\`\${field}-must-use-http-or-https\`);\n      return null;\n    }\n    if (!loopbackHosts.has(url.hostname)) {\n      findings.push(\`\${field}-must-be-loopback\`);\n      return null;\n    }\n    return url;\n  } catch {\n    findings.push(\`\${field}-must-be-valid-url\`);\n    return null;\n  }\n}\n\n`;
  source = source.replace(anchor, `${addition}${anchor}`);
}
fs.writeFileSync(sourcePath, source);

const testPath = 'scripts/restore-drill-local-run.test.mjs';
let tests = fs.readFileSync(testPath, 'utf8');
if (!tests.includes('validateLocalRestoreRuntimeEnvironment,')) {
  tests = tests.replace(
    '  validateLocalRestoreRunFacts,\n',
    '  validateLocalRestoreRunFacts,\n  validateLocalRestoreRuntimeEnvironment,\n',
  );
}

if (!tests.includes("runtime preflight rejects remote or mismatched")) {
  const anchor = "test('timeline chooses the older DB/Storage point and stops RTO at business usability', () => {";
  if (!tests.includes(anchor)) throw new Error('test insertion anchor missing');
  const addition = `test('runtime preflight rejects remote or mismatched Supabase and Storage targets', () => {\n  assert.equal(validateLocalRestoreRuntimeEnvironment(baseRuntimeEnv()).complete, true);\n\n  const remote = validateLocalRestoreRuntimeEnvironment({\n    ...baseRuntimeEnv(),\n    SESN_SUPABASE_URL: 'https://example.com',\n  });\n  assert.equal(remote.complete, false);\n  assert.ok(remote.findings.includes('SESN_SUPABASE_URL-must-be-loopback'));\n\n  const mismatch = validateLocalRestoreRuntimeEnvironment({\n    ...baseRuntimeEnv(),\n    SESN_RESTORE_STORAGE_URL: 'http://127.0.0.1:54322',\n  });\n  assert.equal(mismatch.complete, false);\n  assert.ok(mismatch.findings.includes('storage-and-supabase-origin-must-match'));\n});\n\n`;
  tests = tests.replace(anchor, `${addition}${anchor}`);
}

if (!tests.includes('    env: baseRuntimeEnv(),')) {
  const anchor = "    outputPath: 'private-evidence.json',\n";
  if (!tests.includes(anchor)) throw new Error('orchestrator env anchor missing');
  tests = tests.replace(anchor, `${anchor}    env: baseRuntimeEnv(),\n`);
}

if (!tests.includes('function baseRuntimeEnv()')) {
  const anchor = 'function baseFacts() {';
  if (!tests.includes(anchor)) throw new Error('test helper anchor missing');
  const addition = `function baseRuntimeEnv() {\n  return {\n    SESN_RESTORE_STORAGE_URL: 'http://127.0.0.1:54321',\n    SESN_RESTORE_STORAGE_SERVICE_ROLE_KEY: 'local-service-role-test',\n    SESN_SUPABASE_URL: 'http://127.0.0.1:54321',\n    SESN_SUPABASE_PUBLISHABLE_KEY: 'local-publishable-test',\n    SESN_SUPABASE_SECRET_KEY: 'local-secret-test',\n    SESN_TEST_EMAIL: 'test-user-a@example.test',\n    SESN_TEST_PASSWORD: 'local-test-password',\n    SESN_TEST_USER_A_EMAIL: 'test-user-a@example.test',\n    SESN_TEST_USER_A_PASSWORD: 'local-test-password',\n    SESN_TEST_USER_B_EMAIL: 'test-user-b@example.test',\n    SESN_TEST_USER_B_PASSWORD: 'local-test-password',\n  };\n}\n\n`;
  tests = tests.replace(anchor, `${addition}${anchor}`);
}
fs.writeFileSync(testPath, tests);
