import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { buildApp } from '../app.js';
import { FakeProposalMessageDeliveryProvider } from '../modules/proposal-message-delivery/proposal-message-delivery-service.js';

const EXPECTED = {
  apiUrl: 'http://127.0.0.1:54321',
  dbHost: '127.0.0.1',
  dbPort: '54322',
  dbContainer: 'supabase_db_ses-navigator',
};

type SupabaseStatus = Record<string, unknown>;

type DeliveryBody = {
  messageId?: string;
  proposalId?: string;
  status?: string;
  recipients?: Array<{
    deliveryStatus?: string;
    attempts?: Array<{ attemptNo?: number; status?: string }>;
  }>;
};

async function main() {
  log('1/9 Verify NORMAL LOCAL target');
  const status = readSupabaseStatus();
  assertLocalTarget(status);

  const supabaseUrl = requiredStatusString(status, ['API_URL', 'api_url']);
  const anonKey = requiredStatusString(status, ['ANON_KEY', 'anon_key']);
  const serviceRoleKey = requiredStatusString(status, [
    'SERVICE_ROLE_KEY',
    'service_role_key',
  ]);

  process.env.SUPABASE_URL = supabaseUrl;
  process.env.SUPABASE_ANON_KEY = anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
  process.env.MESSAGE_DELIVERY_PROVIDER = 'fake';
  process.env.NODE_ENV = 'test';
  delete process.env.VERCEL_ENV;

  const ids = makeFixtureIds();
  const email = `proposal-delivery-smoke-${ids.suffix}@example.com`;
  const password = `LocalSmoke!${ids.suffix}Aa1`;
  let userId: string | null = null;
  const app = buildApp({
    proposalMessageDeliveryProvider: new FakeProposalMessageDeliveryProvider(),
  });

  try {
    log('2/9 Create temporary local auth user');
    userId = await createLocalUser({
      supabaseUrl,
      serviceRoleKey,
      email,
      password,
    });

    log('3/9 Create isolated tenant/proposal/message fixtures');
    runPsql(fixtureSql({ ...ids, userId, email }));

    log('4/9 Authenticate through local Supabase Auth');
    const accessToken = await login({
      supabaseUrl,
      anonKey,
      email,
      password,
    });

    log('5/9 Verify unauthenticated API boundary');
    const unauth = await app.inject({
      method: 'GET',
      url: `/api/v1/proposals/${ids.proposalId}/messages/${ids.messageId}/delivery`,
    });
    assert(unauth.statusCode === 401, `Expected 401, got ${unauth.statusCode}`);

    log('6/9 Send with fake provider and observe retryable failure');
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/proposals/${ids.proposalId}/messages/${ids.messageId}/send`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'idempotency-key': `local-smoke-send-${ids.suffix}`,
      },
    });
    assert(first.statusCode === 200, describeFailure('send', first));
    const firstBody = first.json<DeliveryBody>();
    assert(firstBody.status === 'failed', 'First fake delivery must fail');
    assert(
      firstBody.recipients?.[0]?.deliveryStatus === 'failed',
      'Recipient must be failed after first attempt',
    );
    assert(
      firstBody.recipients?.[0]?.attempts?.some(
        (attempt) => attempt.attemptNo === 1 && attempt.status === 'failed',
      ),
      'Attempt 1 failed history was not recorded',
    );

    log('7/9 Retry and verify only failed recipient is retried');
    const retry = await app.inject({
      method: 'POST',
      url: `/api/v1/proposals/${ids.proposalId}/messages/${ids.messageId}/retry`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'idempotency-key': `local-smoke-retry-${ids.suffix}`,
      },
    });
    assert(retry.statusCode === 200, describeFailure('retry', retry));
    const retryBody = retry.json<DeliveryBody>();
    assert(retryBody.status === 'sent', 'Retry must finish with sent status');
    assert(
      retryBody.recipients?.[0]?.deliveryStatus === 'sent',
      'Recipient must be sent after retry',
    );
    const retryAttempts = retryBody.recipients?.[0]?.attempts ?? [];
    assert(retryAttempts.length === 2, 'Delivery history must contain 2 attempts');
    assert(
      retryAttempts.some(
        (attempt) => attempt.attemptNo === 2 && attempt.status === 'accepted',
      ),
      'Attempt 2 accepted history was not recorded',
    );

    log('8/9 Read delivery history and verify proposal milestone');
    const delivery = await app.inject({
      method: 'GET',
      url: `/api/v1/proposals/${ids.proposalId}/messages/${ids.messageId}/delivery`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert(delivery.statusCode === 200, describeFailure('delivery read', delivery));
    const deliveryBody = delivery.json<DeliveryBody>();
    assert(deliveryBody.status === 'sent', 'Delivery read must report sent');
    assert(
      deliveryBody.recipients?.[0]?.attempts?.length === 2,
      'Delivery read must preserve both attempts',
    );

    const dbEvidence = runPsqlQuery(
      `select concat_ws('|',
        (select status from app.proposals where id = '${ids.proposalId}'::uuid),
        (select status from app.outbound_messages where id = '${ids.messageId}'::uuid),
        (select count(*) from app.message_delivery_attempts where outbound_message_id = '${ids.messageId}'::uuid),
        (select count(*) from audit.audit_logs where resource_type = 'outbound_message' and resource_id = '${ids.messageId}'::uuid and action = 'proposal_message.delivery_attempt_recorded')
      );`,
    ).trim();
    assert(
      dbEvidence === 'sent|sent|2|2',
      `Unexpected database evidence: ${dbEvidence}`,
    );

    log('9/9 Runtime smoke passed');
    console.log(
      JSON.stringify(
        {
          status: 'PROPOSAL_DELIVERY_LOCAL_RUNTIME_SMOKE_PASSED',
          target: {
            apiUrl: EXPECTED.apiUrl,
            dbPort: EXPECTED.dbPort,
            dbContainer: EXPECTED.dbContainer,
            restoreDrillTouched: false,
            remoteDatabaseTouched: false,
          },
          checks: {
            unauthenticatedBoundary: 401,
            firstAttempt: 'failed',
            retryAttempt: 'accepted',
            finalMessageStatus: 'sent',
            finalProposalStatus: 'sent',
            attemptCount: 2,
            auditAttemptCount: 2,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close().catch(() => undefined);
    if (ids.tenantId) {
      try {
        runPsql(`delete from app.tenants where id = '${ids.tenantId}'::uuid;`);
      } catch (error) {
        console.error(
          `Local fixture cleanup warning: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
    if (userId) {
      await deleteLocalUser({
        supabaseUrl,
        serviceRoleKey,
        userId,
      }).catch((error: unknown) => {
        console.error(
          `Local auth cleanup warning: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      });
    }
  }
}

function readSupabaseStatus(): SupabaseStatus {
  const output = run('supabase', ['status', '-o', 'json']);
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  assert(start >= 0 && end >= start, 'supabase status did not return JSON');
  const parsed = JSON.parse(output.slice(start, end + 1)) as unknown;
  assert(
    parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed),
    'supabase status returned an invalid object',
  );
  return parsed as SupabaseStatus;
}

function assertLocalTarget(status: SupabaseStatus) {
  const apiUrl = normalizeUrl(requiredStatusString(status, ['API_URL', 'api_url']));
  assert(apiUrl === EXPECTED.apiUrl, `Unexpected API URL: ${apiUrl}`);

  const dbUrl = requiredStatusString(status, ['DB_URL', 'db_url']);
  const url = new URL(dbUrl);
  assert(url.hostname === EXPECTED.dbHost, `Unexpected DB host: ${url.hostname}`);
  assert(url.port === EXPECTED.dbPort, `Unexpected DB port: ${url.port}`);

  const containers = run('docker', ['ps', '--format', '{{.Names}}'])
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
  assert(
    containers.includes(EXPECTED.dbContainer),
    'Expected NORMAL LOCAL DB container is not running',
  );
}

function requiredStatusString(status: SupabaseStatus, keys: string[]) {
  for (const key of keys) {
    const value = status[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  throw new Error(`Missing Supabase status value: ${keys.join('/')}`);
}

function makeFixtureIds() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  return {
    suffix,
    tenantId: randomUUID(),
    roleId: randomUUID(),
    companyId: randomUUID(),
    engineerId: randomUUID(),
    projectId: randomUUID(),
    positionId: randomUUID(),
    proposalId: randomUUID(),
    messageId: randomUUID(),
    versionId: randomUUID(),
    recipientId: randomUUID(),
  };
}

function fixtureSql(input: ReturnType<typeof makeFixtureIds> & {
  userId: string;
  email: string;
}) {
  return `
begin;

insert into app.tenants(id, code, name, status, settings)
values ('${input.tenantId}', 'smoke-${input.suffix}', 'Proposal Delivery Smoke', 'active', '{"local_smoke":true}'::jsonb);

insert into app.user_profiles(user_id, display_name, email, status)
values ('${input.userId}', 'Proposal Delivery Smoke', '${input.email}', 'active');

insert into app.tenant_memberships(tenant_id, user_id, membership_status, is_default, joined_at)
values ('${input.tenantId}', '${input.userId}', 'active', true, now());

insert into app.roles(id, tenant_id, code, name, is_system)
values ('${input.roleId}', '${input.tenantId}', 'local-smoke', 'Local Smoke', false);

insert into app.role_permissions(tenant_id, role_id, permission_id)
select '${input.tenantId}'::uuid, '${input.roleId}'::uuid, p.id
from app.permissions p
where p.code in ('proposal.read','proposal.send','message.read','message.send');

insert into app.user_roles(tenant_id, user_id, role_id, organization_id)
values ('${input.tenantId}', '${input.userId}', '${input.roleId}', null);

insert into app.companies(
  id, tenant_id, management_no, legal_name, legal_name_normalized,
  display_name, status, primary_owner_user_id, created_by, updated_by
) values (
  '${input.companyId}', '${input.tenantId}', 'SMOKE-COMP-${input.suffix}',
  'Smoke Company', 'Smoke Company', 'Smoke Company', 'active',
  '${input.userId}', '${input.userId}', '${input.userId}'
);

insert into app.engineers(
  id, tenant_id, management_no, family_name, given_name, display_name,
  name_normalized, status, availability_status, primary_owner_user_id,
  created_by, updated_by
) values (
  '${input.engineerId}', '${input.tenantId}', 'SMOKE-ENG-${input.suffix}',
  'Smoke', 'Engineer', 'Smoke Engineer', 'SmokeEngineer',
  'active', 'available', '${input.userId}', '${input.userId}', '${input.userId}'
);

insert into app.projects(
  id, tenant_id, management_no, project_name, project_name_normalized,
  project_status, recruitment_status, primary_customer_company_id,
  primary_owner_user_id, created_by, updated_by
) values (
  '${input.projectId}', '${input.tenantId}', 'SMOKE-PRJ-${input.suffix}',
  'Proposal Delivery Smoke Project', 'Proposal Delivery Smoke Project',
  'open', 'recruiting', '${input.companyId}', '${input.userId}',
  '${input.userId}', '${input.userId}'
);

insert into app.project_positions(
  id, tenant_id, project_id, management_no, title, status,
  created_by, updated_by
) values (
  '${input.positionId}', '${input.tenantId}', '${input.projectId}',
  'SMOKE-POS-${input.suffix}', 'Smoke Position', 'open',
  '${input.userId}', '${input.userId}'
);

insert into app.proposals(
  id, tenant_id, management_no, project_position_id, engineer_id,
  destination_company_id, status, primary_owner_user_id, created_by, updated_by
) values (
  '${input.proposalId}', '${input.tenantId}', 'SMOKE-PROP-${input.suffix}',
  '${input.positionId}', '${input.engineerId}', '${input.companyId}',
  'approved', '${input.userId}', '${input.userId}', '${input.userId}'
);

insert into app.outbound_messages(
  id, tenant_id, proposal_id, project_id, engineer_id, channel,
  subject, body_text, status, approved_at, approved_by, created_by, updated_by
) values (
  '${input.messageId}', '${input.tenantId}', '${input.proposalId}',
  '${input.projectId}', '${input.engineerId}', 'email',
  'Approved smoke subject', 'Approved smoke body', 'approved',
  now(), '${input.userId}', '${input.userId}', '${input.userId}'
);

insert into app.outbound_message_versions(
  id, tenant_id, outbound_message_id, version_no, subject, body_text,
  generation_source, created_by
) values (
  '${input.versionId}', '${input.tenantId}', '${input.messageId}', 1,
  'Approved smoke subject', 'Approved smoke body', 'manual', '${input.userId}'
);

update app.outbound_messages
set current_version_id = '${input.versionId}',
    approved_version_id = '${input.versionId}'
where id = '${input.messageId}';

insert into app.outbound_message_recipients(
  id, tenant_id, outbound_message_id, recipient_type,
  recipient_name, recipient_address, delivery_status
) values (
  '${input.recipientId}', '${input.tenantId}', '${input.messageId}',
  'to', 'Retry Recipient', 'retry@example.com', 'pending'
);

commit;
`;
}

async function createLocalUser({
  supabaseUrl,
  serviceRoleKey,
  email,
  password,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  email: string;
  password: string;
}) {
  const response = await fetch(`${normalizeUrl(supabaseUrl)}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
    }),
  });
  const body = (await readJson(response)) as { id?: unknown };
  assert(
    response.ok && typeof body.id === 'string',
    `Local auth user creation failed (HTTP ${response.status})`,
  );
  return body.id;
}

async function deleteLocalUser({
  supabaseUrl,
  serviceRoleKey,
  userId,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
}) {
  const response = await fetch(
    `${normalizeUrl(supabaseUrl)}/auth/v1/admin/users/${userId}`,
    {
      method: 'DELETE',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`Local auth cleanup failed (HTTP ${response.status})`);
  }
}

async function login({
  supabaseUrl,
  anonKey,
  email,
  password,
}: {
  supabaseUrl: string;
  anonKey: string;
  email: string;
  password: string;
}) {
  const response = await fetch(
    `${normalizeUrl(supabaseUrl)}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: anonKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    },
  );
  const body = (await readJson(response)) as { access_token?: unknown };
  assert(
    response.ok && typeof body.access_token === 'string',
    `Local auth login failed (HTTP ${response.status})`,
  );
  return body.access_token;
}

function runPsql(sql: string) {
  run(
    'docker',
    [
      'exec',
      '-i',
      EXPECTED.dbContainer,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
    ],
    sql,
  );
}

function runPsqlQuery(sql: string) {
  return run(
    'docker',
    [
      'exec',
      '-i',
      EXPECTED.dbContainer,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-A',
      '-t',
      '-q',
    ],
    sql,
  );
}

function run(command: string, args: string[], input?: string) {
  const executable =
    process.platform === 'win32' && command === 'supabase'
      ? 'supabase.exe'
      : command;
  const outcome = spawnSync(executable, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: false,
    input,
  });
  if (outcome.error) throw outcome.error;
  if (outcome.status !== 0) {
    throw new Error(
      `${command} failed: ${(outcome.stderr || outcome.stdout || '').trim()}`,
    );
  }
  return outcome.stdout ?? '';
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function describeFailure(label: string, response: { statusCode: number; body: string }) {
  return `${label} failed (HTTP ${response.statusCode}): ${response.body.slice(0, 500)}`;
}

function normalizeUrl(value: string) {
  return value.replace(/\/+$/u, '');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function log(message: string) {
  console.log(message);
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Proposal delivery local runtime smoke failed',
  );
  process.exitCode = 1;
});
