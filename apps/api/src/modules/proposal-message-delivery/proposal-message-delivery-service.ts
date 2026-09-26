export interface ProposalMessageDeliveryProviderInput {
  attemptId: string;
  attemptNo: number;
  messageId: string;
  proposalId: string;
  subject: string;
  bodyText: string;
  recipient: {
    id: string;
    type: 'to' | 'cc' | 'bcc';
    name: string | null;
    address: string;
  };
}

export interface ProposalMessageDeliveryProviderResult {
  status: 'accepted' | 'delivered' | 'bounced' | 'failed';
  providerMessageId: string | null;
  responseCode: string | null;
  responsePayload: Record<string, unknown> | null;
  errorMessage: string | null;
}

export interface ProposalMessageDeliveryProvider {
  readonly name: string;
  readonly available: boolean;
  deliver(
    input: ProposalMessageDeliveryProviderInput,
  ): Promise<ProposalMessageDeliveryProviderResult>;
}

export class DisabledProposalMessageDeliveryProvider implements ProposalMessageDeliveryProvider {
  readonly name = 'disabled';
  readonly available = false;

  deliver(): Promise<ProposalMessageDeliveryProviderResult> {
    return Promise.reject(
      new Error('Proposal message delivery provider is not configured'),
    );
  }
}

export class FakeProposalMessageDeliveryProvider implements ProposalMessageDeliveryProvider {
  readonly name = 'fake';
  readonly available = true;

  deliver(
    input: ProposalMessageDeliveryProviderInput,
  ): Promise<ProposalMessageDeliveryProviderResult> {
    const localPart = input.recipient.address.split('@', 1)[0]?.toLowerCase();
    if (localPart === 'bounce') {
      return Promise.resolve({
        status: 'bounced',
        providerMessageId: `fake-${input.attemptId}`,
        responseCode: '550',
        responsePayload: { simulation: 'bounce' },
        errorMessage: 'Simulated bounce',
      });
    }
    if (localPart === 'fail') {
      return Promise.resolve({
        status: 'failed',
        providerMessageId: null,
        responseCode: '503',
        responsePayload: { simulation: 'failure' },
        errorMessage: 'Simulated delivery failure',
      });
    }
    if (localPart === 'retry' && input.attemptNo === 1) {
      return Promise.resolve({
        status: 'failed',
        providerMessageId: null,
        responseCode: '503',
        responsePayload: { simulation: 'retryable_failure' },
        errorMessage: 'Simulated first-attempt failure',
      });
    }
    return Promise.resolve({
      status: 'accepted',
      providerMessageId: `fake-${input.attemptId}`,
      responseCode: '202',
      responsePayload: { simulation: 'accepted' },
      errorMessage: null,
    });
  }
}

interface MicrosoftGraphProposalMessageDeliveryProviderOptions {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  sender: string;
  fetch?: typeof fetch;
  now?: () => number;
}

interface CachedAccessToken {
  value: string;
  expiresAt: number;
}

export class MicrosoftGraphProposalMessageDeliveryProvider implements ProposalMessageDeliveryProvider {
  readonly name = 'microsoft_graph';
  readonly available: boolean;

  private readonly tenantId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly sender: string;
  private readonly request: typeof fetch;
  private readonly now: () => number;
  private cachedAccessToken: CachedAccessToken | null = null;

  constructor(options: MicrosoftGraphProposalMessageDeliveryProviderOptions) {
    this.tenantId = options.tenantId.trim();
    this.clientId = options.clientId.trim();
    this.clientSecret = options.clientSecret.trim();
    this.sender = options.sender.trim();
    this.request = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.available = [
      this.tenantId,
      this.clientId,
      this.clientSecret,
      this.sender,
    ].every((value) => value.length > 0);
  }

  async deliver(
    input: ProposalMessageDeliveryProviderInput,
  ): Promise<ProposalMessageDeliveryProviderResult> {
    if (!this.available) {
      throw new Error('Microsoft Graph delivery provider is not configured');
    }

    let token: string;
    try {
      token = await this.getAccessToken();
    } catch (error) {
      if (error instanceof MicrosoftGraphProviderError) {
        return failureResult(error.statusCode, error.safeMessage, {
          stage: 'authentication',
          requestId: error.requestId,
          retryAfter: error.retryAfter,
        });
      }
      return failureResult(null, 'Microsoft Graph authentication failed', {
        stage: 'authentication',
      });
    }

    const payload = graphMessagePayload(input);
    try {
      const response = await this.request(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.sender)}/sendMail`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            'client-request-id': input.attemptId,
            'return-client-request-id': 'true',
          },
          body: JSON.stringify(payload),
        },
      );

      const requestId =
        responseHeader(response, 'request-id') ??
        responseHeader(response, 'client-request-id');
      const retryAfter = responseHeader(response, 'retry-after');

      if (response.status === 202) {
        return {
          status: 'accepted',
          providerMessageId: null,
          responseCode: '202',
          responsePayload: compactResponseMetadata(requestId, retryAfter),
          errorMessage: null,
        };
      }

      return failureResult(
        String(response.status),
        graphFailureMessage(response.status),
        compactResponseMetadata(requestId, retryAfter),
      );
    } catch {
      return failureResult(null, 'Microsoft Graph request failed', {
        stage: 'send',
      });
    }
  }

  private async getAccessToken(): Promise<string> {
    if (
      this.cachedAccessToken &&
      this.cachedAccessToken.expiresAt > this.now()
    ) {
      return this.cachedAccessToken.value;
    }

    const response = await this.request(
      `https://login.microsoftonline.com/${encodeURIComponent(this.tenantId)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials',
          scope: 'https://graph.microsoft.com/.default',
        }).toString(),
      },
    );

    if (!response.ok) {
      throw new MicrosoftGraphProviderError(
        String(response.status),
        'Microsoft Graph authentication failed',
        responseHeader(response, 'request-id'),
        responseHeader(response, 'retry-after'),
      );
    }

    const json = (await response.json()) as Record<string, unknown>;
    const accessToken =
      typeof json.access_token === 'string' ? json.access_token : '';
    const expiresIn =
      typeof json.expires_in === 'number'
        ? json.expires_in
        : Number(json.expires_in);

    if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new MicrosoftGraphProviderError(
        '502',
        'Microsoft Graph authentication response was invalid',
        responseHeader(response, 'request-id'),
        null,
      );
    }

    const cacheSeconds = Math.max(1, expiresIn - 60);
    this.cachedAccessToken = {
      value: accessToken,
      expiresAt: this.now() + cacheSeconds * 1000,
    };
    return accessToken;
  }
}

class MicrosoftGraphProviderError extends Error {
  constructor(
    readonly statusCode: string | null,
    readonly safeMessage: string,
    readonly requestId: string | null,
    readonly retryAfter: string | null,
  ) {
    super(safeMessage);
  }
}

function graphMessagePayload(input: ProposalMessageDeliveryProviderInput) {
  const recipient = {
    emailAddress: {
      address: input.recipient.address,
      ...(input.recipient.name ? { name: input.recipient.name } : {}),
    },
  };
  const recipientKey = {
    to: 'toRecipients',
    cc: 'ccRecipients',
    bcc: 'bccRecipients',
  }[input.recipient.type];

  return {
    message: {
      subject: input.subject,
      body: {
        contentType: 'Text',
        content: input.bodyText,
      },
      [recipientKey]: [recipient],
    },
    saveToSentItems: true,
  };
}

function responseHeader(response: unknown, name: string): string | null {
  const headers = (
    response as { headers?: { get(key: string): string | null } }
  ).headers;
  return headers?.get(name) ?? null;
}

function graphFailureMessage(status: number): string {
  if (status === 401 || status === 403)
    return 'Microsoft Graph authorization failed';
  if (status === 429) return 'Microsoft Graph rate limited request';
  if (status >= 500) return 'Microsoft Graph service unavailable';
  return 'Microsoft Graph rejected request';
}

function compactResponseMetadata(
  requestId: string | null,
  retryAfter: string | null,
): Record<string, unknown> | null {
  if (!requestId && !retryAfter) return null;
  return {
    ...(requestId ? { requestId } : {}),
    ...(retryAfter ? { retryAfter } : {}),
  };
}

function failureResult(
  responseCode: string | null,
  errorMessage: string,
  responsePayload: Record<string, unknown> | null,
): ProposalMessageDeliveryProviderResult {
  return {
    status: 'failed',
    providerMessageId: null,
    responseCode,
    responsePayload,
    errorMessage,
  };
}

export function createDefaultProposalMessageDeliveryProvider(): ProposalMessageDeliveryProvider {
  const mode = process.env.MESSAGE_DELIVERY_PROVIDER?.trim().toLowerCase();
  const production =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production';

  if (mode === 'fake' && !production) {
    return new FakeProposalMessageDeliveryProvider();
  }
  if (mode === 'microsoft_graph') {
    return new MicrosoftGraphProposalMessageDeliveryProvider({
      tenantId: process.env.MICROSOFT_GRAPH_TENANT_ID ?? '',
      clientId: process.env.MICROSOFT_GRAPH_CLIENT_ID ?? '',
      clientSecret: process.env.MICROSOFT_GRAPH_CLIENT_SECRET ?? '',
      sender: process.env.MICROSOFT_GRAPH_SENDER ?? '',
    });
  }
  return new DisabledProposalMessageDeliveryProvider();
}
