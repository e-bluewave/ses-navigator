import { viewSpecs } from './data-api-security-regression.mjs';

const tenantAId = '7a110000-0000-4000-8000-000000000001';
const missingResourceId = '7affffff-ffff-4fff-8fff-ffffffffffff';
const requiredVariables = [
  'SESN_SUPABASE_URL',
  'SESN_SUPABASE_PUBLISHABLE_KEY',
  'SESN_SUPABASE_SECRET_KEY',
  'SESN_TEST_USER_A_EMAIL',
  'SESN_TEST_USER_A_PASSWORD',
];

export const resourceSpecs = [
  {
    type: 'engineer_private',
    idProperty: 'engineer_id',
    tenantAResourceId: '7a220000-0000-4000-8000-000000000001',
    tenantBResourceId: '7a220000-0000-4000-8000-000000000002',
    properties: [
      'resource_type',
      'tenant_id',
      'engineer_id',
      'birth_date',
      'gender',
      'prefecture',
      'city',
      'updated_at',
    ],
  },
  {
    type: 'contract',
    idProperty: 'id',
    tenantAResourceId: '7a310000-0000-4000-8000-000000000001',
    tenantBResourceId: '7a310000-0000-4000-8000-000000000002',
    properties: [
      'resource_type',
      'tenant_id',
      'id',
      'contract_no',
      'project_id',
      'proposal_id',
      'engineer_id',
      'contract_type',
      'status',
      'title',
      'start_date',
      'end_date',
      'auto_renew',
      'currency',
      'updated_at',
      'row_version',
    ],
  },
  {
    type: 'invoice',
    idProperty: 'id',
    tenantAResourceId: '7a420000-0000-4000-8000-000000000001',
    tenantBResourceId: '7a420000-0000-4000-8000-000000000002',
    properties: [
      'resource_type',
      'tenant_id',
      'id',
      'invoice_no',
      'invoice_type',
      'contract_id',
      'billing_company_id',
      'billing_period_start',
      'billing_period_end',
      'issue_date',
      'due_date',
      'status',
      'currency',
      'subtotal',
      'tax_amount',
      'total_amount',
      'paid_amount',
      'sent_at',
      'updated_at',
      'row_version',
    ],
  },
  {
    type: 'ai_execution',
    idProperty: 'id',
    tenantAResourceId: '7a510000-0000-4000-8000-000000000001',
    tenantBResourceId: '7a510000-0000-4000-8000-000000000002',
    properties: [
      'resource_type',
      'tenant_id',
      'id',
      'job_id',
      'execution_type',
      'provider',
      'model_name',
      'prompt_version',
      'status',
      'requested_by',
      'requested_at',
      'started_at',
      'completed_at',
      'input_tokens',
      'output_tokens',
      'estimated_cost',
      'currency',
      'error_code',
      'created_at',
      'updated_at',
      'row_version',
    ],
  },
  {
    type: 'audit_event',
    idProperty: 'id',
    tenantAResourceId: '7a610000-0000-4000-8000-000000000001',
    tenantBResourceId: '7a610000-0000-4000-8000-000000000002',
    properties: [
      'resource_type',
      'tenant_id',
      'id',
      'occurred_at',
      'actor_user_id',
      'actor_type',
      'action',
      'resource_type_name',
      'resource_id',
      'request_id',
      'before_data',
      'after_data',
      'metadata',
      'created_at',
    ],
  },
];

const forbiddenAuditValues = [
  'private-a@example.invalid',
  'secret-token-a',
  'secret-api-key-a',
  'PRIVATE USER AGENT A',
  '192.0.2.1',
];

export async function runServiceRoleRpcSecurityRegression({
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const missing = requiredVariables.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
  if (env.SESN_SUPABASE_SECRET_KEY.startsWith('sb_publishable_')) {
    throw new Error('A publishable key was supplied as the secret key');
  }

  const supabaseUrl = env.SESN_SUPABASE_URL.replace(/\/+$/, '');
  const publicKey = env.SESN_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = env.SESN_SUPABASE_SECRET_KEY;
  let accessToken;

  try {
    accessToken = await signIn(fetchImpl, supabaseUrl, publicKey, {
      email: env.SESN_TEST_USER_A_EMAIL,
      password: env.SESN_TEST_USER_A_PASSWORD,
    });
    const checks = [];
    const serviceHeaders = headers(secretKey, serviceBearer(secretKey));

    for (const spec of viewSpecs) {
      const response = await fetchImpl(
        `${supabaseUrl}/rest/v1/${spec.name}?select=*`,
        { headers: serviceHeaders },
      );
      checks.push(
        check(
          'service_role_view_denial',
          'service_role',
          spec.name,
          response.status,
          'HTTP 403',
          response.status === 403,
        ),
      );
    }

    if (checks.every((item) => item.result === 'PASS')) {
      await runRpcChecks({
        checks,
        fetchImpl,
        supabaseUrl,
        publicKey,
        serviceHeaders,
        accessToken,
      });
    }

    const failures = checks.filter((item) => item.result === 'FAIL');
    const viewChecks = checks.filter(
      (item) => item.stage === 'service_role_view_denial',
    );
    const rpcChecks = checks.filter(
      (item) => item.stage !== 'service_role_view_denial',
    );
    const viewDenialPassed =
      viewChecks.length === 6 &&
      viewChecks.every((item) => item.result === 'PASS');
    const rpcPassed =
      rpcChecks.length === 13 &&
      rpcChecks.every((item) => item.result === 'PASS');
    const status = !viewDenialPassed
      ? 'SERVICE_ROLE_VIEW_DENIAL_FAILED'
      : !rpcPassed
        ? 'LIMITED_RPC_VALIDATION_FAILED'
        : 'SERVICE_ROLE_AND_RPC_VALIDATION_PASSED';
    const summary = {
      status,
      databaseChanges: false,
      responseBodiesExposed: false,
      totalChecks: checks.length,
      passed: checks.length - failures.length,
      failed: failures.length,
      failures,
      checks,
    };
    log(JSON.stringify(summary, null, 2));
    if (failures.length > 0 || !rpcPassed) {
      throw new Error(
        `Service Role security regression failed (${failures.length}/${checks.length})`,
      );
    }
    return summary;
  } finally {
    if (accessToken) {
      await signOut(fetchImpl, supabaseUrl, publicKey, accessToken).catch(
        () => undefined,
      );
    }
  }
}

async function runRpcChecks({
  checks,
  fetchImpl,
  supabaseUrl,
  publicKey,
  serviceHeaders,
  accessToken,
}) {
  const contract = resourceSpecs.find((spec) => spec.type === 'contract');
  const anon = await callRpc(
    fetchImpl,
    supabaseUrl,
    headers(publicKey),
    tenantAId,
    contract.type,
    contract.tenantAResourceId,
  );
  checks.push(
    check(
      'rpc_role_boundary',
      'anon',
      'service_get_sensitive_record',
      anon.status,
      'HTTP 401',
      anon.status === 401,
    ),
  );

  const authenticated = await callRpc(
    fetchImpl,
    supabaseUrl,
    headers(publicKey, accessToken),
    tenantAId,
    contract.type,
    contract.tenantAResourceId,
  );
  checks.push(
    check(
      'rpc_role_boundary',
      'authenticated',
      'service_get_sensitive_record',
      authenticated.status,
      'HTTP 403',
      authenticated.status === 403,
    ),
  );

  for (const spec of resourceSpecs) {
    const response = await callRpc(
      fetchImpl,
      supabaseUrl,
      serviceHeaders,
      tenantAId,
      spec.type,
      spec.tenantAResourceId,
    );
    const text = await response.text();
    const payload = parseJson(text);
    const shapePassed =
      payload !== null &&
      arraysEqual(Object.keys(payload).sort(), [...spec.properties].sort());
    const tenantPassed =
      payload?.tenant_id === tenantAId &&
      payload?.resource_type === spec.type &&
      payload?.[spec.idProperty] === spec.tenantAResourceId;
    const redactionPassed =
      spec.type !== 'audit_event' ||
      forbiddenAuditValues.every((value) => !text.includes(value));
    checks.push(
      check(
        'rpc_allowed_resources',
        'service_role',
        spec.type,
        response.status,
        'HTTP 200, exact reviewed shape',
        response.status === 200 &&
          shapePassed &&
          tenantPassed &&
          redactionPassed,
        { shapePassed, tenantPassed, redactionPassed },
      ),
    );
  }

  const missing = await callRpc(
    fetchImpl,
    supabaseUrl,
    serviceHeaders,
    tenantAId,
    'contract',
    missingResourceId,
  );
  checks.push(
    check(
      'rpc_not_found',
      'service_role',
      'absent_resource',
      missing.status,
      'HTTP 404',
      missing.status === 404,
    ),
  );

  for (const spec of resourceSpecs) {
    const response = await callRpc(
      fetchImpl,
      supabaseUrl,
      serviceHeaders,
      tenantAId,
      spec.type,
      spec.tenantBResourceId,
    );
    checks.push(
      check(
        'rpc_tenant_mismatch',
        'service_role',
        spec.type,
        response.status,
        'HTTP 404',
        response.status === 404,
      ),
    );
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
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.access_token !== 'string') {
    throw new Error(`User A sign-in failed (HTTP ${response.status})`);
  }
  return body.access_token;
}

function signOut(fetchImpl, supabaseUrl, apiKey, accessToken) {
  return fetchImpl(`${supabaseUrl}/auth/v1/logout`, {
    method: 'POST',
    headers: headers(apiKey, accessToken),
  });
}

function callRpc(
  fetchImpl,
  supabaseUrl,
  requestHeaders,
  tenantId,
  resourceType,
  resourceId,
) {
  return fetchImpl(`${supabaseUrl}/rest/v1/rpc/service_get_sensitive_record`, {
    method: 'POST',
    headers: { ...requestHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_resource_type: resourceType,
      p_resource_id: resourceId,
    }),
  });
}

function headers(apiKey, accessToken) {
  return {
    apikey: apiKey,
    accept: 'application/json',
    'cache-control': 'no-store',
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : undefined),
  };
}

function serviceBearer(secretKey) {
  return secretKey.startsWith('sb_secret_') ? undefined : secretKey;
}

function check(
  stage,
  actor,
  target,
  httpStatus,
  expected,
  passed,
  detail = {},
) {
  return {
    stage,
    actor,
    target,
    httpStatus,
    expected,
    ...detail,
    result: passed ? 'PASS' : 'FAIL',
  };
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function arraysEqual(left, right) {
  return (
    left.length === right.length && left.every((item, i) => item === right[i])
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runServiceRoleRpcSecurityRegression().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Security regression failed',
    );
    process.exitCode = 1;
  });
}
