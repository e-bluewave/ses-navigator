import { isMainModule } from './cli-entry.mjs';

const requiredVariables = [
  'SESN_SUPABASE_URL',
  'SESN_SUPABASE_PUBLISHABLE_KEY',
  'SESN_TEST_USER_A_EMAIL',
  'SESN_TEST_USER_A_PASSWORD',
];

export async function runDataApiRuntimeBoundaryRegression({
  env = process.env,
  fetchImpl = fetch,
  randomUuid = () => crypto.randomUUID(),
  log = console.log,
} = {}) {
  const missing = requiredVariables.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  const supabaseUrl = env.SESN_SUPABASE_URL.replace(/\/+$/, '');
  const apiKey = env.SESN_SUPABASE_PUBLISHABLE_KEY;
  const probeId = randomUuid();
  let accessToken;

  try {
    accessToken = await signIn(fetchImpl, supabaseUrl, apiKey, {
      email: env.SESN_TEST_USER_A_EMAIL,
      password: env.SESN_TEST_USER_A_PASSWORD,
    });

    const checks = [];
    checks.push(
      await expectDenied(
        fetchImpl,
        'anon_app_relation_read_denied',
        `${supabaseUrl}/rest/v1/projects?select=id&limit=0`,
        requestHeaders(apiKey, undefined, 'app'),
      ),
      await expectDenied(
        fetchImpl,
        'anon_public_rpc_denied',
        `${supabaseUrl}/rest/v1/rpc/current_tenant_id`,
        requestHeaders(apiKey, undefined, 'public'),
        { method: 'POST', body: '{}' },
      ),
    );

    const authAppHeaders = requestHeaders(apiKey, accessToken, 'app');
    const authPublicHeaders = requestHeaders(apiKey, accessToken, 'public');
    const probeResponse = await fetchImpl(
      `${supabaseUrl}/rest/v1/projects?select=id&id=eq.${probeId}`,
      { headers: authAppHeaders },
    );
    const probeRows = probeResponse.ok ? await readJson(probeResponse) : null;
    checks.push(
      check(
        'authenticated_app_relation_read_allowed',
        probeResponse.status,
        probeResponse.status === 200 &&
          Array.isArray(probeRows) &&
          probeRows.length === 0,
        'HTTP 200 and zero rows for a fresh probe ID',
      ),
    );

    const tenantResponse = await fetchImpl(
      `${supabaseUrl}/rest/v1/rpc/current_tenant_id`,
      { method: 'POST', headers: authPublicHeaders, body: '{}' },
    );
    const tenantId = tenantResponse.ok ? await readJson(tenantResponse) : null;
    checks.push(
      check(
        'authenticated_public_rpc_allowed',
        tenantResponse.status,
        tenantResponse.status === 200 && isUuid(tenantId),
        'HTTP 200 and a tenant UUID',
      ),
    );

    if (
      !probeResponse.ok ||
      !Array.isArray(probeRows) ||
      probeRows.length > 0
    ) {
      throw new Error('Zero-row write probe target could not be verified');
    }

    const allowedUpdate = await fetchImpl(
      `${supabaseUrl}/rest/v1/projects?id=eq.${probeId}`,
      {
        method: 'PATCH',
        headers: {
          ...authAppHeaders,
          prefer: 'return=representation',
        },
        body: JSON.stringify({ summary: null }),
      },
    );
    const allowedRows = allowedUpdate.ok ? await readJson(allowedUpdate) : null;
    checks.push(
      check(
        'authenticated_reviewed_update_surface_allowed',
        allowedUpdate.status,
        allowedUpdate.status === 200 &&
          Array.isArray(allowedRows) &&
          allowedRows.length === 0,
        'HTTP 200 and zero updated rows',
      ),
      await expectDenied(
        fetchImpl,
        'authenticated_unreviewed_update_surface_denied',
        `${supabaseUrl}/rest/v1/contracts?id=eq.${probeId}`,
        authAppHeaders,
        {
          method: 'PATCH',
          body: JSON.stringify({ title: 'must-not-write' }),
        },
      ),
      await expectDenied(
        fetchImpl,
        'authenticated_service_rpc_denied',
        `${supabaseUrl}/rest/v1/rpc/service_get_sensitive_record`,
        authPublicHeaders,
        {
          method: 'POST',
          body: JSON.stringify({
            p_tenant_id: tenantId,
            p_resource_type: 'contract',
            p_resource_id: probeId,
          }),
        },
      ),
    );

    const auditResponse = await fetchImpl(
      `${supabaseUrl}/rest/v1/audit_logs?select=id&limit=0`,
      { headers: requestHeaders(apiKey, accessToken, 'audit') },
    );
    checks.push(
      check(
        'audit_schema_not_exposed',
        auditResponse.status,
        [400, 404, 406].includes(auditResponse.status),
        'HTTP 400, 404, or 406',
      ),
    );

    const failures = checks.filter((item) => item.result === 'FAIL');
    const summary = {
      status:
        failures.length === 0
          ? 'DATA_API_RUNTIME_BOUNDARY_PASSED'
          : 'DATA_API_RUNTIME_BOUNDARY_FAILED',
      mutatesData: false,
      zeroRowWriteProbe: true,
      totalChecks: checks.length,
      passed: checks.length - failures.length,
      failed: failures.length,
      failures,
      checks,
    };
    log(JSON.stringify(summary, null, 2));
    if (failures.length > 0) {
      throw new Error(
        `Data API runtime boundary regression failed (${failures.length}/${checks.length})`,
      );
    }
    return summary;
  } finally {
    if (accessToken) {
      await fetchImpl(`${supabaseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: apiKey, authorization: `Bearer ${accessToken}` },
      }).catch(() => undefined);
    }
  }
}

async function signIn(fetchImpl, supabaseUrl, apiKey, credentials) {
  const response = await fetchImpl(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { apikey: apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(credentials),
    },
  );
  const body = await readJson(response);
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error(`User A sign-in failed (HTTP ${response.status})`);
  }
  return body.access_token;
}

async function expectDenied(fetchImpl, name, url, headers, init = {}) {
  const response = await fetchImpl(url, { ...init, headers });
  return check(
    name,
    response.status,
    [401, 403].includes(response.status),
    'HTTP 401 or 403',
  );
}

function requestHeaders(apiKey, accessToken, schema) {
  return {
    apikey: apiKey,
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    'content-type': 'application/json',
    accept: 'application/json',
    'accept-profile': schema,
    'content-profile': schema,
  };
}

function check(name, httpStatus, passed, expected) {
  return {
    name,
    httpStatus,
    expected,
    result: passed ? 'PASS' : 'FAIL',
  };
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

if (isMainModule(import.meta.url)) {
  runDataApiRuntimeBoundaryRegression().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Runtime boundary check failed',
    );
    process.exitCode = 1;
  });
}
