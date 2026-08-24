import assert from 'node:assert/strict';
import test from 'node:test';

import { validateEnvironmentSeparation } from './check-environment-separation.mjs';

const policy = {
  version: 1,
  environments: {
    local: {},
    ci: {},
    staging: {},
    production: {},
  },
  requiredDistinctBindings: [
    ['staging', 'production', 'supabase'],
    ['staging', 'production', 'vercel'],
  ],
  promotionOrder: ['local', 'ci', 'staging', 'production'],
  trackedEnvironmentIdentifiers: false,
  productionDataToLocalAllowed: false,
  productionDataToStagingAllowed: false,
};

const supabaseConfig = `project_id = "ses-navigator"
[auth]
site_url = "http://127.0.0.1:3000"
`;
const gitignore = `.env
.env.*
!.env.example
`;

test('accepts the reviewed environment separation policy', () => {
  const result = validateEnvironmentSeparation({
    policy,
    supabaseConfig,
    gitignore,
    env: {},
  });
  assert.equal(result.status, 'ENVIRONMENT_SEPARATION_PASSED');
  assert.equal(result.runtimeBindingsChecked, false);
  assert.deepEqual(result.failures, []);
});

test('rejects shared Staging and Production runtime bindings', () => {
  const result = validateEnvironmentSeparation({
    policy,
    supabaseConfig,
    gitignore,
    env: {
      SESN_STAGING_SUPABASE_URL: 'https://same.invalid',
      SESN_PRODUCTION_SUPABASE_URL: 'https://same.invalid',
      SESN_STAGING_VERCEL_PROJECT_ID: 'same-project',
      SESN_PRODUCTION_VERCEL_PROJECT_ID: 'same-project',
    },
  });
  assert.equal(result.status, 'ENVIRONMENT_SEPARATION_FAILED');
  assert.equal(result.runtimeBindingsChecked, true);
  assert.equal(result.failures.length, 2);
});

test('rejects Production data promotion to lower environments', () => {
  const unsafePolicy = {
    ...policy,
    productionDataToLocalAllowed: true,
  };
  const result = validateEnvironmentSeparation({
    policy: unsafePolicy,
    supabaseConfig,
    gitignore,
  });
  assert.ok(
    result.failures.includes('production data must not be copied to Local'),
  );
});

test('rejects non-local Supabase CLI configuration', () => {
  const result = validateEnvironmentSeparation({
    policy,
    supabaseConfig: supabaseConfig.replace(
      'http://127.0.0.1:3000',
      'https://production.invalid',
    ),
    gitignore,
  });
  assert.ok(
    result.failures.includes(
      'Local Supabase auth site_url must remain localhost',
    ),
  );
});
