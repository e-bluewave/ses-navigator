import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const runtimePairs = [
  ['SESN_STAGING_SUPABASE_URL', 'SESN_PRODUCTION_SUPABASE_URL'],
  ['SESN_STAGING_VERCEL_PROJECT_ID', 'SESN_PRODUCTION_VERCEL_PROJECT_ID'],
];

const expectedEnvironments = ['local', 'ci', 'staging', 'production'];
const expectedDistinctBindings = [
  'staging:production:supabase',
  'staging:production:vercel',
];

export function validateEnvironmentSeparation(input) {
  const { policy, supabaseConfig, gitignore, env = {} } = input;
  const failures = [];

  if (policy?.version !== 1) {
    failures.push('policy version must be 1');
  }

  for (const name of expectedEnvironments) {
    if (!policy?.environments?.[name]) {
      failures.push(`missing environment policy: ${name}`);
    }
  }

  const distinctBindings = policy?.requiredDistinctBindings ?? [];
  const distinct = new Set(
    distinctBindings.map((entry) => entry.join(':')),
  );

  for (const required of expectedDistinctBindings) {
    if (!distinct.has(required)) {
      failures.push(`missing distinct binding: ${required}`);
    }
  }

  const actualOrder = JSON.stringify(policy?.promotionOrder);
  const expectedOrder = JSON.stringify(expectedEnvironments);
  if (actualOrder !== expectedOrder) {
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

  const localProjectPattern = /project_id\s*=\s*"ses-navigator"/u;
  if (!localProjectPattern.test(supabaseConfig)) {
    failures.push('supabase/config.toml must remain the Local CLI project');
  }

  const localSitePattern = /site_url\s*=\s*"http:\/\/127\.0\.0\.1:3000"/u;
  if (!localSitePattern.test(supabaseConfig)) {
    failures.push('Local Supabase auth site_url must remain localhost');
  }

  const ignoresDotEnv = /^\.env$/mu.test(gitignore);
  const ignoresDotEnvVariants = /^\.env\.\*$/mu.test(gitignore);
  if (!ignoresDotEnv || !ignoresDotEnvVariants) {
    failures.push('Git must ignore environment files');
  }

  let runtimeBindingsChecked = false;
  for (const pair of runtimePairs) {
    const [stagingName, productionName] = pair;
    const stagingValue = env[stagingName]?.trim();
    const productionValue = env[productionName]?.trim();

    if (!stagingValue && !productionValue) {
      continue;
    }

    runtimeBindingsChecked = true;
    if (!stagingValue || !productionValue) {
      const message = `${stagingName} and ${productionName} must be supplied together`;
      failures.push(message);
      continue;
    }

    if (stagingValue === productionValue) {
      const message = `${stagingName} and ${productionName} must be different`;
      failures.push(message);
    }
  }

  let status = 'ENVIRONMENT_SEPARATION_PASSED';
  if (failures.length > 0) {
    status = 'ENVIRONMENT_SEPARATION_FAILED';
  }

  return {
    status,
    runtimeBindingsChecked,
    failures,
  };
}

export async function runEnvironmentSeparationCheck(options = {}) {
  const {
    policyPath = 'ops/environment-separation-policy.json',
    supabaseConfigPath = 'supabase/config.toml',
    gitignorePath = '.gitignore',
    env = process.env,
    log = console.log,
  } = options;

  const reads = [
    readFile(policyPath, 'utf8'),
    readFile(supabaseConfigPath, 'utf8'),
    readFile(gitignorePath, 'utf8'),
  ];
  const [policyText, supabaseConfig, gitignore] = await Promise.all(reads);

  const result = validateEnvironmentSeparation({
    policy: JSON.parse(policyText),
    supabaseConfig,
    gitignore,
    env,
  });

  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    const count = result.failures.length;
    throw new Error(`Environment separation check failed (${count})`);
  }
  return result;
}

if (isMainModule(import.meta.url)) {
  runEnvironmentSeparationCheck().catch((error) => {
    let message = 'Environment separation check failed';
    if (error instanceof Error) {
      message = error.message;
    }
    console.error(message);
    process.exitCode = 1;
  });
}
