import assert from 'node:assert/strict';
import test from 'node:test';

import { runProposalDeliveryRealMailSmoke } from './proposal-delivery-real-mail-smoke.mjs';

const proposalId = '11111111-1111-4111-8111-111111111111';
const messageId = '22222222-2222-4222-8222-222222222222';
const env = {
  SESN_SUPABASE_URL: 'https://example.supabase.co',
  SESN_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  SESN_TEST_EMAIL: 'smoke@example.com',
  SESN_TEST_PASSWORD: 'not-a-real-password',
  SESN_API_URL: 'https://staging.example.com',
  SESN_PROPOSAL_ID: proposalId,
  SESN_MESSAGE_ID: messageId,
  SESN_EXPECTED_RECIPIENTS: 'recipient@example.com',
  SESN_TARGET_ENVIRONMENT: 'Staging',
  SESN_REAL_SEND_CONFIRM: 'SEND_APPROVED_TEST_EMAIL',
};

function approvedDelivery(status = 'approved') {
  return {
    proposalId,
    messageId,
    status,
    recipients: [
      {
        address: 'recipient@example.com',
        attempts:
          status === 'approved'
            ? []
            : [
                {
                  status: 'accepted',
                  provider: 'microsoft_graph',
                  responseCode: '202',
                },
              ],
      },
    ],
  };
}

test('verifies recipients, sends once, confirms history, and logs out', async () => {
  const calls = [];
  let deliveryReads = 0;
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });

    if (url.includes('/token?')) {
      return jsonResponse(200, { access_token: 'access-token' });
    }
    if (url.endsWith('/auth/v1/logout')) {
      return jsonResponse(204, {});
    }
    if (url.endsWith('/send')) {
      return jsonResponse(200, approvedDelivery('sent'));
    }
    if (url.endsWith('/delivery')) {
      deliveryReads += 1;
      return jsonResponse(
        200,
        deliveryReads === 1
          ? approvedDelivery('approved')
          : approvedDelivery('sent'),
      );
    }
    return jsonResponse(404, {});
  };

  const result = await runProposalDeliveryRealMailSmoke({
    env,
    fetchImpl,
    log: () => undefined,
  });

  assert.equal(result.status, 'PROPOSAL_DELIVERY_REAL_MAIL_SMOKE_PASSED');
  assert.equal(result.recipientCount, 1);
  assert.equal(
    calls.filter(({ url }) => url.endsWith('/send')).length,
    1,
  );
  const send = calls.find(({ url }) => url.endsWith('/send'));
  assert.equal(
    send.options.headers['idempotency-key'],
    `staging-real-mail-${messageId}`,
  );
  assert.match(calls.at(-1).url, /\/auth\/v1\/logout$/u);
});

test('never sends when expected recipients do not match', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/token?')) {
      return jsonResponse(200, { access_token: 'access-token' });
    }
    if (url.endsWith('/delivery')) {
      return jsonResponse(200, approvedDelivery('approved'));
    }
    return jsonResponse(204, {});
  };

  await assert.rejects(
    runProposalDeliveryRealMailSmoke({
      env: {
        ...env,
        SESN_EXPECTED_RECIPIENTS: 'different@example.com',
      },
      fetchImpl,
      log: () => undefined,
    }),
    /do not match/u,
  );

  assert.equal(calls.some((url) => url.endsWith('/send')), false);
  assert.match(calls.at(-1), /\/auth\/v1\/logout$/u);
});

test('never authenticates without explicit real-send confirmation', async () => {
  let called = false;

  await assert.rejects(
    runProposalDeliveryRealMailSmoke({
      env: { ...env, SESN_REAL_SEND_CONFIRM: 'NO' },
      fetchImpl: async () => {
        called = true;
        return jsonResponse(500, {});
      },
      log: () => undefined,
    }),
    /confirmation/u,
  );

  assert.equal(called, false);
});

test('refuses non-Staging targets', async () => {
  let called = false;

  await assert.rejects(
    runProposalDeliveryRealMailSmoke({
      env: { ...env, SESN_TARGET_ENVIRONMENT: 'Production' },
      fetchImpl: async () => {
        called = true;
        return jsonResponse(500, {});
      },
      log: () => undefined,
    }),
    /restricted to Staging/u,
  );

  assert.equal(called, false);
});

test('requires an approved message before sending', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.includes('/token?')) {
      return jsonResponse(200, { access_token: 'access-token' });
    }
    if (url.endsWith('/delivery')) {
      return jsonResponse(200, approvedDelivery('failed'));
    }
    return jsonResponse(204, {});
  };

  await assert.rejects(
    runProposalDeliveryRealMailSmoke({
      env,
      fetchImpl,
      log: () => undefined,
    }),
    /must be approved/u,
  );

  assert.equal(urls.some((url) => url.endsWith('/send')), false);
});

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}
