const requiredVariables = [
  'SESN_SUPABASE_URL',
  'SESN_SUPABASE_PUBLISHABLE_KEY',
  'SESN_TEST_USER_A_EMAIL',
  'SESN_TEST_USER_A_PASSWORD',
  'SESN_TEST_USER_B_EMAIL',
  'SESN_TEST_USER_B_PASSWORD',
];

export const viewSpecs = [
  {
    name: 'engineer_private_summaries',
    idColumn: 'engineer_id',
    tenantAId: '7a220000-0000-4000-8000-000000000001',
    tenantBId: '7a220000-0000-4000-8000-000000000002',
    columns: [
      'engineer_id',
      'birth_date',
      'gender',
      'prefecture',
      'city',
      'updated_at',
    ],
  },
  {
    name: 'contract_summaries',
    idColumn: 'id',
    tenantAId: '7a310000-0000-4000-8000-000000000001',
    tenantBId: '7a310000-0000-4000-8000-000000000002',
    columns: [
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
    name: 'finance_invoice_summaries',
    idColumn: 'id',
    tenantAId: '7a420000-0000-4000-8000-000000000001',
    tenantBId: '7a420000-0000-4000-8000-000000000002',
    columns: [
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
    name: 'finance_expense_summaries',
    idColumn: 'id',
    tenantAId: '7a450000-0000-4000-8000-000000000001',
    tenantBId: '7a450000-0000-4000-8000-000000000002',
    columns: [
      'id',
      'contract_id',
      'work_log_id',
      'engineer_id',
      'expense_date',
      'expense_type',
      'description',
      'amount',
      'tax_amount',
      'currency',
      'status',
      'billable',
      'invoice_id',
      'approved_at',
      'updated_at',
      'row_version',
    ],
  },
  {
    name: 'ai_execution_summaries',
    idColumn: 'id',
    tenantAId: '7a510000-0000-4000-8000-000000000001',
    tenantBId: '7a510000-0000-4000-8000-000000000002',
    columns: [
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
    name: 'audit_event_summaries',
    idColumn: 'id',
    tenantAId: '7a610000-0000-4000-8000-000000000001',
    tenantBId: '7a610000-0000-4000-8000-000000000002',
    columns: [
      'id',
      'occurred_at',
      'actor_user_id',
      'actor_type',
      'action',
      'resource_type',
      'resource_id',
      'request_id',
      'created_at',
    ],
  },
];

export async function runDataApiSecurityRegression({
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const missing = requiredVariables.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  const supabaseUrl = env.SESN_SUPABASE_URL.replace(/\/+$/, '');
  const apiKey = env.SESN_SUPABASE_PUBLISHABLE_KEY;
  const sessions = [];

  try {
    sessions.push(
      await signIn(fetchImpl, supabaseUrl, apiKey, 'user_a', {
        email: env.SESN_TEST_USER_A_EMAIL,
        password: env.SESN_TEST_USER_A_PASSWORD,
      }),
    );
    sessions.push(
      await signIn(fetchImpl, supabaseUrl, apiKey, 'user_b', {
        email: env.SESN_TEST_USER_B_EMAIL,
        password: env.SESN_TEST_USER_B_PASSWORD,
      }),
    );
    if (sessions[0].userId === sessions[1].userId) {
      throw new Error('User A and User B resolved to the same Auth user');
    }

    const checks = [];
    for (const spec of viewSpecs) {
      checks.push(
        await checkAnon(fetchImpl, supabaseUrl, apiKey, spec),
        await checkUserA(
          fetchImpl,
          supabaseUrl,
          apiKey,
          sessions[0].accessToken,
          spec,
        ),
        await checkUserB(
          fetchImpl,
          supabaseUrl,
          apiKey,
          sessions[1].accessToken,
          spec,
        ),
      );
    }

    const failures = checks.filter((check) => check.result === 'FAIL');
    const summary = {
      status: failures.length === 0 ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED',
      readOnly: true,
      totalChecks: checks.length,
      passed: checks.length - failures.length,
      failed: failures.length,
      failures,
      checks,
    };
    log(JSON.stringify(summary, null, 2));
    if (failures.length > 0) {
      throw new Error(
        `Data API security regression failed (${failures.length}/${checks.length})`,
      );
    }
    return summary;
  } finally {
    await Promise.allSettled(
      sessions.map((session) =>
        signOut(fetchImpl, supabaseUrl, apiKey, session.accessToken),
      ),
    );
  }
}

async function signIn(fetchImpl, supabaseUrl, apiKey, actor, credentials) {
  const response = await fetchImpl(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { apikey: apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(credentials),
    },
  );
  const body = await readJson(response);
  if (
    !response.ok ||
    typeof body.access_token !== 'string' ||
    typeof body.user?.id !== 'string'
  ) {
    throw new Error(`${actor} sign-in failed (HTTP ${response.status})`);
  }
  return { accessToken: body.access_token, userId: body.user.id };
}

async function signOut(fetchImpl, supabaseUrl, apiKey, accessToken) {
  await fetchImpl(`${supabaseUrl}/auth/v1/logout`, {
    method: 'POST',
    headers: { apikey: apiKey, authorization: `Bearer ${accessToken}` },
  });
}

async function checkAnon(fetchImpl, supabaseUrl, apiKey, spec) {
  const response = await readView(fetchImpl, supabaseUrl, apiKey, spec.name);
  return result('anon', spec.name, response.status, null, 401);
}

async function checkUserA(fetchImpl, supabaseUrl, apiKey, accessToken, spec) {
  const response = await readView(
    fetchImpl,
    supabaseUrl,
    apiKey,
    spec.name,
    accessToken,
  );
  const rows = response.ok ? await readJson(response) : null;
  const validRows = Array.isArray(rows) ? rows : [];
  const expectedColumns = [...spec.columns].sort();
  const actualColumns =
    validRows.length === 1 ? Object.keys(validRows[0]).sort() : [];
  const passed =
    response.status === 200 &&
    validRows.length === 1 &&
    validRows[0]?.[spec.idColumn] === spec.tenantAId &&
    !validRows.some((row) => row?.[spec.idColumn] === spec.tenantBId) &&
    arraysEqual(actualColumns, expectedColumns);
  return result(
    'user_a',
    spec.name,
    response.status,
    validRows.length,
    'HTTP 200, rows 1, exact columns and Tenant A only',
    passed,
  );
}

async function checkUserB(fetchImpl, supabaseUrl, apiKey, accessToken, spec) {
  const response = await readView(
    fetchImpl,
    supabaseUrl,
    apiKey,
    spec.name,
    accessToken,
  );
  const rows = response.ok ? await readJson(response) : null;
  const validRows = Array.isArray(rows) ? rows : [];
  return result(
    'user_b',
    spec.name,
    response.status,
    validRows.length,
    'HTTP 200, rows 0',
    response.status === 200 && Array.isArray(rows) && rows.length === 0,
  );
}

function readView(fetchImpl, supabaseUrl, apiKey, viewName, accessToken) {
  return fetchImpl(`${supabaseUrl}/rest/v1/${viewName}?select=*`, {
    headers: {
      apikey: apiKey,
      accept: 'application/json',
      'cache-control': 'no-store',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : undefined),
    },
  });
}

function result(actor, view, httpStatus, rowCount, expected, passed) {
  const success = passed ?? httpStatus === expected;
  return {
    actor,
    view,
    httpStatus,
    rowCount,
    expected: typeof expected === 'number' ? `HTTP ${expected}` : expected,
    result: success ? 'PASS' : 'FAIL',
  };
}

function arraysEqual(left, right) {
  return (
    left.length === right.length && left.every((item, i) => item === right[i])
  );
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDataApiSecurityRegression().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Security regression failed',
    );
    process.exitCode = 1;
  });
}
