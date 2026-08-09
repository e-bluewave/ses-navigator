const requiredVariables = [
  'SESN_SUPABASE_URL',
  'SESN_SUPABASE_PUBLISHABLE_KEY',
  'SESN_TEST_EMAIL',
  'SESN_TEST_PASSWORD',
  'SESN_API_URL',
];

export async function runAuthProjectSmoke({
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const missing = requiredVariables.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  const supabaseUrl = withoutTrailingSlash(env.SESN_SUPABASE_URL);
  const apiUrl = withoutTrailingSlash(env.SESN_API_URL);
  const publishableKey = env.SESN_SUPABASE_PUBLISHABLE_KEY;

  log('1/3 Supabase Auth login');
  const tokenResponse = await fetchImpl(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: env.SESN_TEST_EMAIL,
        password: env.SESN_TEST_PASSWORD,
      }),
    },
  );
  const tokenBody = await readJson(tokenResponse);
  if (!tokenResponse.ok || typeof tokenBody.access_token !== 'string') {
    throw new Error(
      `Supabase Auth login failed (HTTP ${tokenResponse.status})`,
    );
  }

  const accessToken = tokenBody.access_token;
  try {
    log('2/3 Authenticated projects request');
    const projectsResponse = await fetchImpl(
      `${apiUrl}/api/v1/projects?limit=1`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    const projectsBody = await readJson(projectsResponse);
    if (!projectsResponse.ok) {
      throw new Error(
        `Projects request failed (HTTP ${projectsResponse.status}, code ${safeCode(projectsBody)})`,
      );
    }
    if (!Array.isArray(projectsBody.items)) {
      throw new Error('Projects response did not contain an items array');
    }
    log(
      `Projects request passed (${projectsBody.items.length} item(s) returned)`,
    );
  } finally {
    log('3/3 Supabase Auth logout');
    await fetchImpl(`${supabaseUrl}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${accessToken}`,
      },
    }).catch(() => undefined);
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function safeCode(body) {
  return typeof body.code === 'string' ? body.code : 'unknown';
}

function withoutTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAuthProjectSmoke()
    .then(() => console.log('Auth + projects integration smoke passed'))
    .catch((error) => {
      console.error(
        error instanceof Error ? error.message : 'Smoke test failed',
      );
      process.exitCode = 1;
    });
}
