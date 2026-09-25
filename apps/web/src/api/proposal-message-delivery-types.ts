export type ProposalMessageDeliveryStatus =
  | 'approved'
  | 'queued'
  | 'sent'
  | 'failed';

export type ProposalMessageDeliveryAttemptStatus =
  | 'queued'
  | 'accepted'
  | 'delivered'
  | 'bounced'
  | 'failed';

export interface ProposalMessageDeliveryAttempt {
  id: string;
  attemptNo: number;
  status: ProposalMessageDeliveryAttemptStatus;
  provider: string | null;
  providerMessageId: string | null;
  attemptedAt: string;
  responseCode: string | null;
  errorMessage: string | null;
}

export interface ProposalMessageDeliveryRecipient {
  id: string;
  type: 'to' | 'cc' | 'bcc';
  name: string | null;
  address: string;
  deliveryStatus: 'pending' | 'sent' | 'delivered' | 'bounced' | 'failed';
  attempts: ProposalMessageDeliveryAttempt[];
}

export interface ProposalMessageDelivery {
  messageId: string;
  proposalId: string;
  status: ProposalMessageDeliveryStatus;
  sentAt: string | null;
  approvedVersionId: string;
  rowVersion: number;
  recipients: ProposalMessageDeliveryRecipient[];
}
