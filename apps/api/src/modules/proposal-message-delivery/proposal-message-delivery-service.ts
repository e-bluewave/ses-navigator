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

export class DisabledProposalMessageDeliveryProvider
  implements ProposalMessageDeliveryProvider
{
  readonly name = 'disabled';
  readonly available = false;

  async deliver(): Promise<ProposalMessageDeliveryProviderResult> {
    throw new Error('Proposal message delivery provider is not configured');
  }
}

export class FakeProposalMessageDeliveryProvider
  implements ProposalMessageDeliveryProvider
{
  readonly name = 'fake';
  readonly available = true;

  async deliver(
    input: ProposalMessageDeliveryProviderInput,
  ): Promise<ProposalMessageDeliveryProviderResult> {
    const localPart = input.recipient.address.split('@', 1)[0]?.toLowerCase();
    if (localPart === 'bounce') {
      return {
        status: 'bounced',
        providerMessageId: `fake-${input.attemptId}`,
        responseCode: '550',
        responsePayload: { simulation: 'bounce' },
        errorMessage: 'Simulated bounce',
      };
    }
    if (localPart === 'fail') {
      return {
        status: 'failed',
        providerMessageId: null,
        responseCode: '503',
        responsePayload: { simulation: 'failure' },
        errorMessage: 'Simulated delivery failure',
      };
    }
    if (localPart === 'retry' && input.attemptNo === 1) {
      return {
        status: 'failed',
        providerMessageId: null,
        responseCode: '503',
        responsePayload: { simulation: 'retryable_failure' },
        errorMessage: 'Simulated first-attempt failure',
      };
    }
    return {
      status: 'accepted',
      providerMessageId: `fake-${input.attemptId}`,
      responseCode: '202',
      responsePayload: { simulation: 'accepted' },
      errorMessage: null,
    };
  }
}

export function createDefaultProposalMessageDeliveryProvider(): ProposalMessageDeliveryProvider {
  const mode = process.env.MESSAGE_DELIVERY_PROVIDER?.trim().toLowerCase();
  const production =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production';

  if (mode === 'fake' && !production) {
    return new FakeProposalMessageDeliveryProvider();
  }
  return new DisabledProposalMessageDeliveryProvider();
}
