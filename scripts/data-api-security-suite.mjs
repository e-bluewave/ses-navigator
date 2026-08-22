import { runDataApiSecurityRegression } from './data-api-security-regression.mjs';
import { runDataApiRuntimeBoundaryRegression } from './data-api-runtime-boundary-regression.mjs';
import { runServiceRoleRpcSecurityRegression } from './service-role-rpc-security-regression.mjs';

const requiredVariables = [
  'SESN_SUPABASE_URL',
  'SESN_SUPABASE_PUBLISHABLE_KEY',
  'SESN_SUPABASE_SECRET_KEY',
  'SESN_TEST_USER_A_EMAIL',
  'SESN_TEST_USER_A_PASSWORD',
  'SESN_TEST_USER_B_EMAIL',
  'SESN_TEST_USER_B_PASSWORD',
];

const defaultStages = [
  { name: 'limited_views', run: runDataApiSecurityRegression },
  { name: 'service_role_rpc', run: runServiceRoleRpcSecurityRegression },
  { name: 'runtime_boundary', run: runDataApiRuntimeBoundaryRegression },
];

const defaultRequestTimeoutMs = 15_000;

export async function runDataApiSecuritySuite({
  env = process.env,
  fetchImpl = fetch,
  randomUuid,
  stages = defaultStages,
  requestTimeoutMs = timeoutFromEnvironment(env),
  log = console.log,
} = {}) {
  const missing = requiredVariables.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
  if (env.SESN_SUPABASE_SECRET_KEY.startsWith('sb_publishable_')) {
    throw new Error('A publishable key was supplied as the secret key');
  }
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error('Security request timeout must be a positive integer');
  }

  const components = [];
  const timedFetch = createTimedFetch(fetchImpl, requestTimeoutMs);
  for (const [index, stage] of stages.entries()) {
    let captured;
    log(
      JSON.stringify(
        progressEvent(
          'DATA_API_SECURITY_STAGE_STARTED',
          stage.name,
          index,
          stages.length,
        ),
      ),
    );
    try {
      const result = await stage.run({
        env,
        fetchImpl: timedFetch,
        randomUuid,
        log: (value) => {
          captured = parseSummary(value);
        },
      });
      components.push(component(stage.name, result));
      log(
        JSON.stringify(
          progressEvent(
            'DATA_API_SECURITY_STAGE_COMPLETED',
            stage.name,
            index,
            stages.length,
          ),
        ),
      );
    } catch (error) {
      components.push(
        component(stage.name, captured, {
          status: 'STAGE_FAILED',
          error:
            error instanceof Error ? error.message : 'Unknown stage failure',
        }),
      );
      log(
        JSON.stringify(
          progressEvent(
            'DATA_API_SECURITY_STAGE_FAILED',
            stage.name,
            index,
            stages.length,
          ),
        ),
      );
      const summary = suiteSummary(components, false, stages.length);
      log(JSON.stringify(summary, null, 2));
      throw new Error(
        `Data API security suite failed at ${stage.name}: ${components.at(-1).error}`,
      );
    }
  }

  const summary = suiteSummary(components, true, stages.length);
  log(JSON.stringify(summary, null, 2));
  return summary;
}

export function createTimedFetch(fetchImpl, timeoutMs) {
  return async (input, init = {}) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;
    try {
      return await fetchImpl(input, { ...init, signal });
    } catch (error) {
      if (timeoutSignal.aborted) {
        throw new Error(`HTTP request timed out after ${timeoutMs} ms`, {
          cause: error,
        });
      }
      throw error;
    }
  };
}

function timeoutFromEnvironment(env) {
  const configured = env.SESN_SECURITY_REQUEST_TIMEOUT_MS?.trim();
  if (!configured) return defaultRequestTimeoutMs;
  return Number(configured);
}

function progressEvent(event, stage, index, totalStages) {
  return {
    event,
    stage,
    stageIndex: index + 1,
    totalStages,
  };
}

function component(name, value, fallback = {}) {
  const summary = value && typeof value === 'object' ? value : {};
  return {
    name,
    status:
      typeof summary.status === 'string'
        ? summary.status
        : (fallback.status ?? 'STAGE_FAILED'),
    totalChecks: integer(summary.totalChecks),
    passed: integer(summary.passed),
    failed: integer(summary.failed),
    ...(fallback.error ? { error: fallback.error } : {}),
  };
}

function suiteSummary(components, passed, totalStages) {
  return {
    status: passed
      ? 'DATA_API_SECURITY_SUITE_PASSED'
      : 'DATA_API_SECURITY_SUITE_FAILED',
    databaseChanges: false,
    totalChecks: sum(components, 'totalChecks'),
    passed: sum(components, 'passed'),
    failed: sum(components, 'failed'),
    completedStages: components.length,
    totalStages,
    components,
  };
}

function parseSummary(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function integer(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function sum(values, property) {
  return values.reduce((total, value) => total + value[property], 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDataApiSecuritySuite().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Security suite failed',
    );
    process.exitCode = 1;
  });
}
