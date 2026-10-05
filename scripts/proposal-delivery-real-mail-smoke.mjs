import { isMainModule } from './cli-entry.mjs';

const REQUIRED_VARIABLES = [
  'SESN_SUPABASE_URL',
  'SESN_SUPABASE_PUBLISHABLE_KEY',
  'SESN_TEST_EMAIL',
  'SESN_TEST_PASSWORD',
  'SESN_API_URL',
  'SESN_PROPOSAL_ID',
  'SESN_MESSAGE_ID',
  'SESN_EXPECTED_RECIPIENTS',
  'SESN_EXPECTED_SUBJECT',
  'SESN_EXPECTED_BODY',
  'SESN_TARGET_ENVIRONMENT',
  'SESN_REAL_SEND_CONFIRM',
  'SESN_EXPECTED_PROVIDER',
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONFIRM_TEXT = 'SEND_APPROVED_TEST_EMAIL';

export async function runProposalDeliveryRealMailSmoke({
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const missing = REQUIRED_VARIABLES.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  if (env.SESN_TARGET_ENVIRONMENT.trim() !== 'Staging') {
    throw new Error('Real mail smoke is restricted to Staging');
  }
  if (env.SESN_REAL_SEND_CONFIRM !== CONFIRM_TEXT) {
    throw new Error('Explicit real mail confirmation is required');
  }
  const expectedProvider = env.SESN_EXPECTED_PROVIDER.trim().toLowerCase();
  if (!['smtp', 'microsoft_graph'].includes(expectedProvider)) {
    throw new Error('Expected provider must be smtp or microsoft_graph');
  }
  const expectedCode = expectedProvider === 'smtp' ? '250' : '202';
  if (
    !UUID_RE.test(env.SESN_PROPOSAL_ID) ||
    !UUID_RE.test(env.SESN_MESSAGE_ID)
  ) {
    throw new Error('SESN_PROPOSAL_ID and SESN_MESSAGE_ID must be UUIDs');
  }

  const expectedRecipients = normalizeExpectedRecipients(
    env.SESN_EXPECTED_RECIPIENTS,
  );
  if (
    expectedRecipients.length !== 1 ||
    env.SESN_EXPECTED_RECIPIENTS.split(',').length !== 1
  ) {
    throw new Error('Exactly one expected recipient is required');
  }

  const supabaseUrl = withoutTrailingSlash(env.SESN_SUPABASE_URL);
  const apiUrl = withoutTrailingSlash(env.SESN_API_URL);
  const publishableKey = env.SESN_SUPABASE_PUBLISHABLE_KEY;

  log('1/5 Supabase Auth login');
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
  const deliveryUrl = `${apiUrl}/api/v1/proposals/${env.SESN_PROPOSAL_ID}/messages/${env.SESN_MESSAGE_ID}/delivery`;
  const draftUrl = `${apiUrl}/api/v1/proposals/${env.SESN_PROPOSAL_ID}/ai/message-drafts/latest`;

  try {
    log('2/5 Verify approved message and delivery target');
    const draftResponse = await fetchImpl(draftUrl, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const draft = await readJson(draftResponse);
    if (!draftResponse.ok) {
      throw new Error(
        `Message read failed (HTTP ${draftResponse.status}, code ${safeCode(draft)})`,
      );
    }
    if (
      draft?.id !== env.SESN_MESSAGE_ID ||
      draft?.proposalId !== env.SESN_PROPOSAL_ID ||
      draft?.status !== 'approved' ||
      !draft?.approvedVersionId ||
      draft.subject !== env.SESN_EXPECTED_SUBJECT ||
      draft.bodyText !== env.SESN_EXPECTED_BODY ||
      !exactlyOneRecipient(draft.recipients, expectedRecipients[0])
    ) {
      throw new Error(
        'Approved message does not match expected identity, content, or recipient',
      );
    }
    const beforeResponse = await fetchImpl(deliveryUrl, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const before = await readJson(beforeResponse);
    if (!beforeResponse.ok) {
      throw new Error(
        `Delivery read failed (HTTP ${beforeResponse.status}, code ${safeCode(before)})`,
      );
    }
    if (
      before.messageId !== env.SESN_MESSAGE_ID ||
      before.proposalId !== env.SESN_PROPOSAL_ID ||
      before.approvedVersionId !== draft.approvedVersionId ||
      before.status !== 'approved'
    ) {
      throw new Error('Message must be approved before real mail smoke');
    }

    if (!exactlyOneRecipient(before.recipients, expectedRecipients[0])) {
      throw new Error('Delivery recipients do not match expected recipients');
    }
    if (before.recipients[0].attempts?.length !== 0) {
      throw new Error('Delivery already has an attempt');
    }
    const actualRecipients = expectedRecipients;
    log(
      `Recipient verification passed (${actualRecipients.length} recipient(s))`,
    );

    log('3/5 Send approved proposal message');
    const sendResponse = await fetchImpl(
      `${apiUrl}/api/v1/proposals/${env.SESN_PROPOSAL_ID}/messages/${env.SESN_MESSAGE_ID}/send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'idempotency-key': `staging-real-mail-${env.SESN_MESSAGE_ID}`,
        },
      },
    );
    const sent = await readJson(sendResponse);
    if (!sendResponse.ok) {
      throw new Error(
        `Real mail send failed (HTTP ${sendResponse.status}, code ${safeCode(sent)})`,
      );
    }

    assertProviderAccepted(sent, expectedProvider, expectedCode);
    log('Delivery attempt accepted');

    log('4/5 Re-read delivery history');
    const afterResponse = await fetchImpl(deliveryUrl, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const after = await readJson(afterResponse);
    if (!afterResponse.ok) {
      throw new Error(
        `Delivery history read failed (HTTP ${afterResponse.status}, code ${safeCode(after)})`,
      );
    }
    assertProviderAccepted(after, expectedProvider, expectedCode);

    const result = {
      status: 'PROPOSAL_DELIVERY_REAL_MAIL_SMOKE_PASSED',
      targetEnvironment: 'Staging',
      recipientCount: actualRecipients.length,
      provider: expectedProvider,
      responseCode: expectedCode,
      messageStatus: after.status,
    };
    log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    log('5/5 Supabase Auth logout');
    await fetchImpl(`${supabaseUrl}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${accessToken}`,
      },
    }).catch(() => undefined);
  }
}

function assertProviderAccepted(delivery, provider, code) {
  const recipients = Array.isArray(delivery?.recipients)
    ? delivery.recipients
    : [];
  if (recipients.length === 0) {
    throw new Error('Delivery response did not contain recipients');
  }

  const accepted = recipients.every((recipient) => {
    const attempts = Array.isArray(recipient?.attempts)
      ? recipient.attempts
      : [];
    const latest = attempts.at(-1);
    return (
      latest?.provider === provider &&
      latest?.responseCode === code &&
      (latest?.status === 'accepted' || latest?.status === 'delivered')
    );
  });
  if (!accepted) {
    throw new Error('Expected provider accepted attempt was not recorded');
  }
}

function normalizeExpectedRecipients(value) {
  return [
    ...new Set(value.split(',').map(normalizeAddress).filter(Boolean)),
  ].sort();
}

function exactlyOneRecipient(recipients, expected) {
  return (
    Array.isArray(recipients) &&
    recipients.length === 1 &&
    normalizeAddress(recipients[0]?.address) === expected
  );
}

function normalizeAddress(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function safeCode(body) {
  return typeof body?.code === 'string' ? body.code : 'unknown';
}

function withoutTrailingSlash(value) {
  return value.replace(/\/+$/u, '');
}

if (isMainModule(import.meta.url)) {
  runProposalDeliveryRealMailSmoke()
    .then(() => console.log('Proposal delivery real mail smoke passed'))
    .catch((error) => {
      console.error(
        error instanceof Error ? error.message : 'Real mail smoke failed',
      );
      process.exitCode = 1;
    });
}
