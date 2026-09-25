import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  ProposalMessageDelivery,
  ProposalMessageDeliveryPreparation,
  ProposalMessageDeliveryRepository,
} from '../src/modules/proposal-message-delivery/proposal-message-delivery-repository.js';
import type {
  ProposalMessageDeliveryProvider,
  ProposalMessageDeliveryProviderResult,
} from '../src/modules/proposal-message-delivery/proposal-message-delivery-service.js';

const proposalId = '11111111-1111-4111-8111-111111111111';
const messageId = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';
const recipientId = '44444444-4444-4444-8444-444444444444';
const preparation: ProposalMessageDeliveryPreparation = {
  batchId: '55555555-5555-4555-8555-555555555555',
  proposalId,
  messageId,
  subject: '提案メール',
  bodyText: '本文',
  attempts: [
    {
      attemptId,
      recipientId,
      recipientType: 'to',
      recipientName: '営業担当',
      recipientAddress: 'sales@example.com',
      attemptNo: 1,
    },
  ],
};
const delivery: ProposalMessageDelivery = {
  proposalId,
  messageId,
  status: 'sent',
  sentAt: '2026-09-25T08:00:00Z',
  approvedVersionId: '66666666-6666-4666-8666-666666666666',
  rowVersion: 4,
  recipients: [
    {
      id: recipientId,
      type: 'to',
      name: '営業担当',
      address: 'sales@example.com',
      deliveryStatus: 'sent',
      attempts: [
        {
          id: attemptId,
          attemptNo: 1,
          status: 'accepted',
          provider: 'fake',
          providerMessageId: 'fake-message',
          attemptedAt: '2026-09-25T08:00:00Z',
          responseCode: '202',
          errorMessage: null,
        },
      ],
    },
  ],
};

function repository(
  overrides: Partial<ProposalMessageDeliveryRepository> = {},
): ProposalMessageDeliveryRepository {
  return {
    canSend: vi.fn(() => Promise.resolve(true)),
    canRead: vi.fn(() => Promise.resolve(true)),
    prepareSend: vi.fn(() => Promise.resolve(preparation)),
    prepareRetry: vi.fn(() => Promise.resolve(preparation)),
    recordResult: vi.fn(() => Promise.resolve(delivery)),
    get: vi.fn(() => Promise.resolve(delivery)),
    ...overrides,
  };
}

function provider(
  result: ProposalMessageDeliveryProviderResult = {
    status: 'accepted',
    providerMessageId: 'fake-message',
    responseCode: '202',
    responsePayload: { accepted: true },
    errorMessage: null,
  },
): ProposalMessageDeliveryProvider {
  return {
    name: 'fake',
    available: true,
    deliver: vi.fn(() => Promise.resolve(result)),
  };
}

const apps: ReturnType<typeof buildApp>[] = [];
function app(
  proposalMessageDeliveries = repository(),
  proposalMessageDeliveryProvider = provider(),
) {
  const value = buildApp({
    authentication: {
      authenticate: (accessToken) =>
        Promise.resolve({ id: 'user-1', accessToken }),
    },
    proposalMessageDeliveries,
    proposalMessageDeliveryProvider,
  });
  apps.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((value) => value.close()));
});

describe('proposal message delivery API', () => {
  it('sends only after preparing an idempotent delivery batch', async () => {
    const repo = repository();
    const sendProvider = provider();
    const response = await app(repo, sendProvider).inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/messages/${messageId}/send`,
      headers: {
        authorization: 'Bearer valid',
        'idempotency-key': 'send-1',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'sent' });
    expect(repo.prepareSend).toHaveBeenCalledWith(
      'valid',
      proposalId,
      messageId,
      'send-1',
      expect.any(String),
    );
    expect(sendProvider.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId,
        subject: '提案メール',
        recipient: expect.objectContaining({ address: 'sales@example.com' }),
      }),
    );
    expect(repo.recordResult).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId,
        status: 'accepted',
        provider: 'fake',
      }),
    );
  });

  it('records a provider failure without exposing the thrown error', async () => {
    const recordResult = vi.fn(() =>
      Promise.resolve({ ...delivery, status: 'failed' as const, sentAt: null }),
    );
    const failingProvider: ProposalMessageDeliveryProvider = {
      name: 'fake',
      available: true,
      deliver: vi.fn(() => Promise.reject(new Error('secret provider detail'))),
    };
    const response = await app(repository({ recordResult }), failingProvider).inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/messages/${messageId}/send`,
      headers: {
        authorization: 'Bearer valid',
        'idempotency-key': 'send-2',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'failed' });
    expect(recordResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'Provider delivery failed',
      }),
    );
  });

  it('retries only through the retry preparation RPC', async () => {
    const repo = repository();
    const response = await app(repo).inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/messages/${messageId}/retry`,
      headers: {
        authorization: 'Bearer valid',
        'idempotency-key': 'retry-1',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(repo.prepareRetry).toHaveBeenCalledWith(
      'valid',
      proposalId,
      messageId,
      'retry-1',
      expect.any(String),
    );
  });

  it('fails closed when delivery provider is not configured', async () => {
    const prepareSend = vi.fn(() => Promise.resolve(preparation));
    const response = await app(
      repository({ prepareSend }),
      { name: 'disabled', available: false, deliver: vi.fn() },
    ).inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/messages/${messageId}/send`,
      headers: {
        authorization: 'Bearer valid',
        'idempotency-key': 'send-3',
      },
    });
    expect(response.statusCode).toBe(503);
    expect(prepareSend).not.toHaveBeenCalled();
  });

  it('requires send permissions and an idempotency key', async () => {
    const denied = await app(
      repository({ canSend: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/messages/${messageId}/send`,
      headers: {
        authorization: 'Bearer valid',
        'idempotency-key': 'send-4',
      },
    });
    expect(denied.statusCode).toBe(403);

    const missingKey = await app().inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/messages/${messageId}/send`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(missingKey.statusCode).toBe(400);
  });

  it('returns safe delivery history through the read boundary', async () => {
    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/proposals/${proposalId}/messages/${messageId}/delivery`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(delivery);
  });
});
