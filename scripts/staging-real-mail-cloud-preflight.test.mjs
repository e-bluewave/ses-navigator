import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertCloudConfiguration,
  runStagingReadOnlyPreflight,
} from './staging-real-mail-cloud-preflight.mjs';

const proposalId = '11111111-1111-4111-8111-111111111111';
const messageId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const binding = {
  projectId: 'prj_gpgM7keccxqbJpZssLH5UOBSb0OU',
  orgId: 'team_Wd9vCeAN0Q0MZCaqKXtVjRRw',
};
const config = {
  GITHUB_ACTIONS: 'true',
  SESN_READONLY_PREFLIGHT: 'true',
  SESN_STAGING_SUPABASE_REF: 'stagingprojectref123',
  SUPABASE_URL: 'https://stagingprojectref123.supabase.co',
  SUPABASE_ANON_KEY: 'mock-anon-key',
  VERCEL_TOKEN: 'mock-vercel-token',
  SESN_STAGING_TEST_EMAIL: 'test@example.invalid',
  SESN_STAGING_TEST_PASSWORD: 'mock-password',
  MESSAGE_DELIVERY_PROVIDER: 'smtp',
  SMTP_HOST: 'mail.e-bluewave.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USERNAME: 'yamaguchi@e-bluewave.com',
  SMTP_SENDER: 'yamaguchi@e-bluewave.com',
  SMTP_PASSWORD: 'mock-smtp-password',
};
const draft = {
  id: messageId,
  proposalId,
  status: 'approved',
  approvedVersionId: versionId,
  recipients: [{ address: 'info@e-bluewave.com' }],
  subject: 'SES Navigator SMTP Staging Test',
  bodyText:
    'SES Navigator Staging環境からのSMTP送信テストです。\n受信確認用のテストメールです。',
};
const delivery = {
  messageId,
  proposalId,
  status: 'approved',
  approvedVersionId: versionId,
  recipients: [{ address: 'info@e-bluewave.com', attempts: [] }],
};

function fixture(changes = {}) {
  const env = { ...config, ...changes.env };
  const d = { ...draft, ...changes.draft };
  const history = { ...delivery, ...changes.delivery };
  const calls = [];
  const getProtectedJson = async (path, token) => {
    calls.push({ path, token });
    if (path === '/health') return { status: 'ok' };
    if (path.startsWith('/api/v1/proposals?'))
      return changes.list ?? { items: [{ id: proposalId }], page: {} };
    if (path.endsWith('/ai/message-drafts/latest')) return d;
    if (path.endsWith('/delivery')) return history;
    throw new Error('Unexpected API path');
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method });
    return { ok: true, json: async () => ({ access_token: 'mock-jwt' }) };
  };
  const logs = [];
  const run = () =>
    runStagingReadOnlyPreflight({
      env,
      binding,
      fetchImpl,
      getProtectedJson,
      log: (line) => logs.push(line),
    });
  return { run, env, calls, logs };
}

test('one approved candidate, zero attempts: Auth POST and protected GET only', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(), { status: 'PASSED', matches: 1 });
  assert.equal(f.calls.filter((call) => call.method === 'POST').length, 1);
  assert.ok(
    f.calls.every(
      (call) =>
        !call.path ||
        call.path === '/health' ||
        call.path.startsWith('/api/v1/proposals'),
    ),
  );
  assert.ok(f.calls.every((call) => !call.path?.endsWith('/send')));
  assert.equal(f.calls.filter((call) => call.token === 'mock-jwt').length, 3);
  assert.equal(f.env.SMTP_PASSWORD, undefined);
  assert.equal(f.env.SESN_STAGING_TEST_PASSWORD, undefined);
  assert.ok(!f.logs.join('').includes('mock-'));
});

test('independent project ref and fixed Vercel binding fail closed', () => {
  assert.throws(() =>
    assertCloudConfiguration(
      { ...config, SUPABASE_URL: 'https://productionref123.supabase.co' },
      binding,
    ),
  );
  assert.throws(() =>
    assertCloudConfiguration(config, {
      ...binding,
      projectId: 'prj_production',
    }),
  );
  assert.throws(() =>
    assertCloudConfiguration(
      { ...config, SUPABASE_URL: 'http://stagingprojectref123.supabase.co' },
      binding,
    ),
  );
  assert.throws(() =>
    assertCloudConfiguration({ ...config, GITHUB_ACTIONS: 'false' }, binding),
  );
  assert.throws(() =>
    assertCloudConfiguration(
      { ...config, MESSAGE_DELIVERY_PROVIDER: 'fake' },
      binding,
    ),
  );
});

test('wrong Supabase project stops before any network request', async () => {
  const f = fixture({
    env: { SUPABASE_URL: 'https://productionref123.supabase.co' },
  });
  await assert.rejects(f.run());
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.logs, []);
});

for (const [name, changes] of [
  [
    'different recipient',
    { draft: { recipients: [{ address: 'other@example.invalid' }] } },
  ],
  ['different body', { draft: { bodyText: `${draft.bodyText}\n` } }],
  ['unapproved draft', { draft: { status: 'draft' } }],
  [
    'mismatched approved version',
    { delivery: { approvedVersionId: messageId } },
  ],
  [
    'prior attempt',
    {
      delivery: {
        recipients: [{ address: 'info@e-bluewave.com', attempts: [{}] }],
      },
    },
  ],
  [
    'missing attempt array',
    { delivery: { recipients: [{ address: 'info@e-bluewave.com' }] } },
  ],
  ['no candidate', { list: { items: [], page: {} } }],
]) {
  test(`${name} stops with no mail operation`, async () => {
    const f = fixture(changes);
    await assert.rejects(f.run());
    assert.ok(f.calls.every((call) => !call.path?.endsWith('/send')));
    assert.deepEqual(f.logs, []);
  });
}

test('duplicate candidate stops even when each message matches', async () => {
  const f = fixture({
    list: { items: [{ id: proposalId }, { id: proposalId }], page: {} },
  });
  await assert.rejects(f.run(), /not unique/u);
});

test('scan limit stops before claiming uniqueness', async () => {
  const f = fixture({ list: { items: [], page: {} } });
  // A nonempty cursor cannot be accepted as proof of a complete scan.
  const endless = fixture({
    list: { items: [{ id: proposalId }], page: { nextCursor: 'next' } },
    draft: { subject: 'unrelated' },
  });
  await assert.rejects(endless.run(), /scan limit/u);
  assert.equal(
    endless.calls.filter((call) => call.path?.includes('delivery')).length,
    0,
  );
  await assert.rejects(f.run());
});
