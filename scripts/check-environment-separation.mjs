import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const runtimePairs = [
  ['SESN_STAGING_SUPABASE_URL', 'SESN_PRODUCTION_SUPABASE_URL'],
  ['SESN_STAGING_VERCEL_PROJECT_ID', 'SESN_PRODUCTION_VERCEL_PROJECT_ID'],
];

export function validateEnvironmentSeparation({
  policy,
  supabaseConfig,
  gitignore,
  env = {},
}) {
  const failures = [];
  const expectedEnvironments = ['local', 'ci', 'staging', 'production'];

  if (policy?.version !== 1) failures.push('policy version must be 1');
  for (const name of expectedEnvironments) {
    if (!policy?.environments?.[name]) {
      failures.push(`missing environment policy: ${name}`);
    }
  }

  const distinct = new Set(
    (policy?.requiredDistinctBindings ?? []).map((entry) => entry.join(':')),
  );
  for (const required of [
    'staging:production:supabase',
    'staging:production:vercel',
  ]) {
    if (!distinct.has(required)) failures.push(`missing distinct binding: ${required}`);
  }

  if (JSON.stringify(policy?.promotionOrder) !== JSON.stringify(expectedEnvironments)) {
    failures.push('promotion order must be local -> ci -> staging -> production');
  }
  if (policy?.trackedEnvironmentIdentifiers !== false) {
    failures.push('environment identifiers must remain outside GitHub');
  }
  if (policy?.productionDataToLocalAllowed !== false) {
    failures.push('production data must not be copied to Local');
  }
  if (policy?.productionDataToStagingAllowed !== false) {
    failures.push('production data must not be copied to Staging by default');
  }

  if (!/project_id\s*=\s*"ses-navigator"/u.test(supabaseConfig)) {
    failures.push('supabase/config.toml must remain the Local CLI project');
  }
  if (!/site_url\s*=\s*"http:\/\/127\.0\.0\.1:3000"/u.test(supabaseConfig)) {
    failures.push('Local Supabase auth site_url must remain localhost');
  }
  if (!/^\.env$/mu.test(gitignore) || !/^\.env\.\*$/mu.test(gitignore)) {
    failures.push('Git must ignore environment files');
  }

  let runtimeBindingsChecked = false;
  for (const [stagingName, productionName] of runtimePairs) {
    const stagingValue = env[stagingName]?.trim();
    const productionValue = env[productionName]?.trim();
    if (!stagingValue && !productionValue) continue;
    runtimeBindingsChecked = true;
    if (!stagingValue || !productionValue) {
      failures.push(`${stagingName} and ${productionName} must be supplied together`);
      continue;
    }
    if (stagingValue === productionValue) {
      failures.push(`${stagingName} and ${productionName} must be different`);
    }
  }

  return {
    status:
      failures.length === 0
        ? 'ENVIRONMENT_SEPARATION_PASSED'
        : 'ENVIRONMENT_SEPARATION_FAILED',
    runtimeBindingsChecked,
    failures,
  };
}

export async function runEnvironmentSeparationCheck({
  policyPath = 'ops/environment-separation-policy.json',
  supabaseConfigPath = 'supabase/config.toml',
  gitignorePath = '.gitignore',
  env = process.env,
  log = console.log,
} = {}) {
  const [policyText, supabaseConfig, gitignore] = await Promise.all([
    readFile(policyPath, 'utf8'),
    readFile(supabaseConfigPath, 'utf8'),
    readFile(gitignorePath, 'utf8'),
  ]);
  const result = validateEnvironmentSeparation({
    policy: JSON.parse(policyText),
    supabaseConfig,
    gitignore,
    env,
  });
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(`Environment separation check failed (${result.failures.length})`);
  }
  return result;
}

if (isMainModule(import.meta.url)) {
  runEnvironmentSeparationCheck().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Environment separation check failed',
    );
    process.exitCode = 1;
  });
}
