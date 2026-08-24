import { isMainModule } from './cli-entry.mjs';

const allowedModes = new Set(['login', 'access-token']);
const allowedExpectations = new Set(['allow', 'deny', 'skip']);

export async function runAuthLifecycleAccessProbe({
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const mode = env.SESN_AUTH_LIFECYCLE_PROBE_MODE?.trim();
  if (!allowedModes.has(mode)) {
    throw new Error(
      'SESN_AUTH_LIFECYCLE_PROBE_MODE must be login or access-token',
    );
  }

  const apiExpectation = env.SESN_EXPECT_API?.trim() ?? 'skip';
  if (!allowedExpectations.has(apiExpectation)) {
    throw new Error('SESN_EXPECT_API must be allow, deny, or skip');
  }

  const apiUrl = required(env, 'SESN_API_URL').replace(/\/+$/u, '');
  let accessToken;
  let generatedToken = false;

  if (mode === 'login') {
    const loginExpectation = env.SESN_EXPECT_LOGIN?.trim();
    if (!new Set(['allow', 'deny']).has(loginExpectation)) {
      throw new Error('SESN_EXPECT_LOGIN must be allow or deny in login mode');
    }

    const supabaseUrl = required(env, 'SESN_SUPABASE_URL').replace(/\/+$/u, '');
    const publishableKey = required(env, 'SESN_SUPABASE_PUBLISHABLE_KEY');
    const email = required(env, 'SESN_TEST_EMAIL');
    const password = required(env, 'SESN_TEST_PASSWORD');

    log('1/2 Checking fresh authentication');
    const loginResponse = await fetchImpl(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          apikey: publishableKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      },
    );

    if (loginExpectation === 'deny') {
      if (loginResponse.ok) {
        throw new Error('Fresh authentication unexpectedly succeeded');
      }
      log(
        `Fresh authentication denied as expected (HTTP ${loginResponse.status})`,
      );
      return {
        mode,
        login: 'denied',
        api: 'skipped',
      };
    }

    const loginBody = await readJson(loginResponse);
    if (!loginResponse.ok || typeof loginBody.access_token !== 'string') {
      throw new Error(
        `Fresh authentication failed unexpectedly (HTTP ${loginResponse.status})`,
      );
    }
    accessToken = loginBody.access_token;
    generatedToken = true;
    log('Fresh authentication allowed as expected');
  } else {
    accessToken = required(env, 'SESN_TEST_ACCESS_TOKEN');
    log('1/2 Using existing session token from environment');
  }

  if (apiExpectation === 'skip') {
    log('2/2 API probe skipped');
    return {
      mode,
      login: mode === 'login' ? 'allowed' : 'not-applicable',
      api: 'skipped',
    };
  }

  log('2/2 Checking business API access');
  const response = await fetchImpl(`${apiUrl}/api/v1/projects?limit=1`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (apiExpectation === 'allow' && !response.ok) {
    throw new Error(
      `Business API was unexpectedly rejected (HTTP ${response.status})`,
    );
  }
  if (apiExpectation === 'deny' && ![401, 403].includes(response.status)) {
    throw new Error(
      `Business API was not rejected with 401/403 (HTTP ${response.status})`,
    );
  }

  log(
    apiExpectation === 'allow'
      ? `Business API allowed as expected (HTTP ${response.status})`
      : `Business API denied as expected (HTTP ${response.status})`,
  );

  if (generatedToken) {
    await logoutGeneratedToken({ env, accessToken, fetchImpl }).catch(
      () => undefined,
    );
  }

  return {
    mode,
    login: mode === 'login' ? 'allowed' : 'not-applicable',
    api: apiExpectation === 'allow' ? 'allowed' : 'denied',
  };
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function logoutGeneratedToken({ env, accessToken, fetchImpl }) {
  const supabaseUrl = required(env, 'SESN_SUPABASE_URL').replace(/\/+$/u, '');
  const publishableKey = required(env, 'SESN_SUPABASE_PUBLISHABLE_KEY');
  await fetchImpl(`${supabaseUrl}/auth/v1/logout`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${accessToken}`,
    },
  });
}

if (isMainModule(import.meta.url)) {
  runAuthLifecycleAccessProbe()
    .then((result) => {
      console.log(JSON.stringify(result));
    })
    .catch((error) => {
      console.error(
        error instanceof Error ? error.message : 'Auth lifecycle probe failed',
      );
      process.exitCode = 1;
    });
}
