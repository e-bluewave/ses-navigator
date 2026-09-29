import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DisabledProposalMessageDeliveryProvider,
  FakeProposalMessageDeliveryProvider,
  MicrosoftGraphProposalMessageDeliveryProvider,
  createDefaultProposalMessageDeliveryProvider,
  type ProposalMessageDeliveryProviderInput,
} from '../src/modules/proposal-message-delivery/proposal-message-delivery-service.js';

type FetchLike = typeof fetch;

const envKeys = [
  'MESSAGE_DELIVERY_PROVIDER',
  'MICROSOFT_GRAPH_TENANT_ID',
  'MICROSOFT_GRAPH_CLIENT_ID',
  'MICROSOFT_GRAPH_CLIENT_SECRET',
  'MICROSOFT_GRAPH_SENDER',
  'NODE_ENV',
  'VERCEL_ENV',
] as const;

const originalEnv = new Map<string, string | undefined>();
for (const key of envKeys) {
  originalEnv.set(key, process.env[key]);
}

const input: ProposalMessageDeliveryProviderInput = {
  attemptId: '33333333-3333-4333-8333-333333333333',
  attemptNo: 1,
  messageId: '22222222-2222-4222-8222-222222222222',
  proposalId: '11111111-1111-4111-8111-111111111111',
  subject: '提案メール',
  bodyText: '本文です',
  recipient: {
    id: '44444444-4444-4444-8444-444444444444',
    type: 'to',
    name: '営業担当',
    address: 'sales@example.com',
  },
};

function tokenResponse() {
  return new Response(
    JSON.stringify({
      access_token: 'graph-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}

function requestUrl(value: Parameters<FetchLike>[0]): string {
  if (typeof value === 'string') return value;
  if (value instanceof URL) return value.href;
  return value.url;
}

function graphProvider(request: FetchLike, now = () => 1_000) {
  return new MicrosoftGraphProposalMessageDeliveryProvider({
    tenantId: 'tenant-id',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    sender: 'sender@example.com',
    fetch: request,
    now,
  });
}

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('MicrosoftGraphProposalMessageDeliveryProvider', () => {
  it('sends mail through Microsoft Graph', async () => {
    const request = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(null, {
          status: 202,
          headers: { 'request-id': 'graph-request-id' },
        }),
      );
    const provider = graphProvider(request);

    const result = await provider.deliver(input);

    expect(provider.available).toBe(true);
    expect(result).toEqual({
      status: 'accepted',
      providerMessageId: null,
      responseCode: '202',
      responsePayload: { requestId: 'graph-request-id' },
      errorMessage: null,
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[0]).toBe(
      'https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token',
    );

    const tokenRequest = request.mock.calls[0]?.[1];
    expect(tokenRequest?.method).toBe('POST');
    expect(String(tokenRequest?.body)).toContain(
      'scope=https%3A%2F%2Fgraph.microsoft.com%2F.default',
    );

    expect(request.mock.calls[1]?.[0]).toBe(
      'https://graph.microsoft.com/v1.0/users/sender%40example.com/sendMail',
    );

    const sendRequest = request.mock.calls[1]?.[1];
    expect(sendRequest?.method).toBe('POST');
    expect(new Headers(sendRequest?.headers).get('authorization')).toBe(
      'Bearer graph-token',
    );

    const body = JSON.parse(String(sendRequest?.body)) as {
      message: {
        subject: string;
        body: { contentType: string; content: string };
        toRecipients: Array<{
          emailAddress: { address: string; name?: string };
        }>;
      };
      saveToSentItems: boolean;
    };
    expect(body.message.subject).toBe('提案メール');
    expect(body.message.body).toEqual({
      contentType: 'Text',
      content: '本文です',
    });
    expect(body.message.toRecipients[0]?.emailAddress).toEqual({
      address: 'sales@example.com',
      name: '営業担当',
    });
    expect(body.saveToSentItems).toBe(true);
  });

  it('reuses a valid access token', async () => {
    let now = 1_000;
    const request = vi.fn<FetchLike>((url) => {
      if (requestUrl(url).includes('/oauth2/v2.0/token')) {
        return Promise.resolve(tokenResponse());
      }
      return Promise.resolve(new Response(null, { status: 202 }));
    });
    const provider = graphProvider(request, () => now);

    await provider.deliver(input);
    now += 30_000;
    await provider.deliver({ ...input, attemptNo: 2 });

    const tokenCalls = request.mock.calls.filter(([url]) =>
      requestUrl(url).includes('/oauth2/v2.0/token'),
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it('returns a safe auth failure', async () => {
    const request = vi.fn<FetchLike>(() =>
      Promise.resolve(
        new Response(null, {
          status: 401,
          headers: { 'request-id': 'token-failure-id' },
        }),
      ),
    );
    const provider = graphProvider(request);

    await expect(provider.deliver(input)).resolves.toEqual({
      status: 'failed',
      providerMessageId: null,
      responseCode: '401',
      responsePayload: {
        stage: 'authentication',
        requestId: 'token-failure-id',
        retryAfter: null,
      },
      errorMessage: 'Microsoft Graph authentication failed',
    });
  });

  it('returns a safe rate limit failure', async () => {
    const request = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'TooManyRequests',
              message: 'sensitive provider detail',
            },
          }),
          {
            status: 429,
            headers: {
              'request-id': 'rate-limit-id',
              'retry-after': '30',
            },
          },
        ),
      );
    const provider = graphProvider(request);

    const result = await provider.deliver(input);

    expect(result).toEqual({
      status: 'failed',
      providerMessageId: null,
      responseCode: '429',
      responsePayload: {
        requestId: 'rate-limit-id',
        retryAfter: '30',
      },
      errorMessage: 'Microsoft Graph rate limited request',
    });
    expect(JSON.stringify(result)).not.toContain('sensitive provider detail');
  });

  it('maps cc and bcc recipients', async () => {
    const sentBodies: Record<string, unknown>[] = [];
    const request = vi.fn<FetchLike>((url, init) => {
      if (requestUrl(url).includes('/oauth2/v2.0/token')) {
        return Promise.resolve(tokenResponse());
      }
      sentBodies.push(
        JSON.parse(String(init?.body)) as Record<string, unknown>,
      );
      return Promise.resolve(new Response(null, { status: 202 }));
    });
    const provider = graphProvider(request);

    await provider.deliver({
      ...input,
      recipient: { ...input.recipient, type: 'cc' },
    });
    await provider.deliver({
      ...input,
      attemptId: '55555555-5555-4555-8555-555555555555',
      recipient: { ...input.recipient, type: 'bcc' },
    });

    const firstMessage = sentBodies[0]?.message as Record<string, unknown>;
    const secondMessage = sentBodies[1]?.message as Record<string, unknown>;
    expect(firstMessage.ccRecipients).toBeDefined();
    expect(firstMessage.toRecipients).toBeUndefined();
    expect(secondMessage.bccRecipients).toBeDefined();
    expect(secondMessage.toRecipients).toBeUndefined();
  });
});

describe('createDefaultProposalMessageDeliveryProvider', () => {
  it('keeps fake delivery disabled in production', () => {
    process.env.MESSAGE_DELIVERY_PROVIDER = 'fake';
    process.env.VERCEL_ENV = 'production';

    expect(createDefaultProposalMessageDeliveryProvider()).toBeInstanceOf(
      DisabledProposalMessageDeliveryProvider,
    );
  });

  it('allows fake delivery outside production', () => {
    process.env.MESSAGE_DELIVERY_PROVIDER = 'fake';
    process.env.VERCEL_ENV = 'preview';

    expect(createDefaultProposalMessageDeliveryProvider()).toBeInstanceOf(
      FakeProposalMessageDeliveryProvider,
    );
  });

  it('selects Microsoft Graph when configured', () => {
    process.env.MESSAGE_DELIVERY_PROVIDER = 'microsoft_graph';
    process.env.MICROSOFT_GRAPH_TENANT_ID = 'tenant';
    process.env.MICROSOFT_GRAPH_CLIENT_ID = 'client';
    process.env.MICROSOFT_GRAPH_CLIENT_SECRET = 'secret';
    process.env.MICROSOFT_GRAPH_SENDER = 'sender@example.com';

    const provider = createDefaultProposalMessageDeliveryProvider();

    expect(provider).toBeInstanceOf(
      MicrosoftGraphProposalMessageDeliveryProvider,
    );
    expect(provider.available).toBe(true);
  });

  it('fails closed when Graph settings are incomplete', () => {
    process.env.MESSAGE_DELIVERY_PROVIDER = 'microsoft_graph';
    process.env.MICROSOFT_GRAPH_TENANT_ID = 'tenant';
    process.env.MICROSOFT_GRAPH_CLIENT_ID = 'client';
    delete process.env.MICROSOFT_GRAPH_CLIENT_SECRET;
    process.env.MICROSOFT_GRAPH_SENDER = 'sender@example.com';

    const provider = createDefaultProposalMessageDeliveryProvider();

    expect(provider).toBeInstanceOf(
      MicrosoftGraphProposalMessageDeliveryProvider,
    );
    expect(provider.available).toBe(false);
  });
});
