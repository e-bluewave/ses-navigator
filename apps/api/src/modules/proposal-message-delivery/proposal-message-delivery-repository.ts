import { dataApiSchemaHeaders } from '../../shared/supabase-schema.js';
import { requiredEnv } from '../../plugins/authentication.js';
import { assertSupabaseResponse } from '../../shared/supabase-response.js';

export type DeliveryAttemptStatus =
  | 'queued'
  | 'accepted'
  | 'delivered'
  | 'bounced'
  | 'failed';

export interface ProposalMessageDeliveryPreparation {
  batchId: string;
  messageId: string;
  proposalId: string;
  subject: string;
  bodyText: string;
  attempts: Array<{
    attemptId: string;
    recipientId: string;
    recipientType: 'to' | 'cc' | 'bcc';
    recipientName: string | null;
    recipientAddress: string;
    attemptNo: number;
  }>;
}

export interface ProposalMessageDelivery {
  messageId: string;
  proposalId: string;
  status: 'approved' | 'queued' | 'sent' | 'failed';
  sentAt: string | null;
  approvedVersionId: string;
  rowVersion: number;
  recipients: Array<{
    id: string;
    type: 'to' | 'cc' | 'bcc';
    name: string | null;
    address: string;
    deliveryStatus: 'pending' | 'sent' | 'delivered' | 'bounced' | 'failed';
    attempts: Array<{
      id: string;
      attemptNo: number;
      status: DeliveryAttemptStatus;
      provider: string | null;
      providerMessageId: string | null;
      attemptedAt: string;
      responseCode: string | null;
      errorMessage: string | null;
    }>;
  }>;
}

export interface DeliveryResultInput {
  attemptId: string;
  status: Exclude<DeliveryAttemptStatus, 'queued'>;
  provider: string;
  providerMessageId: string | null;
  responseCode: string | null;
  responsePayload: Record<string, unknown> | null;
  errorMessage: string | null;
}

export interface ProposalMessageDeliveryRepository {
  canSend(token: string): Promise<boolean>;
  canRead(token: string): Promise<boolean>;
  prepareSend(
    token: string,
    proposalId: string,
    messageId: string,
    idempotencyKey: string,
    requestId: string,
  ): Promise<ProposalMessageDeliveryPreparation | null>;
  prepareRetry(
    token: string,
    proposalId: string,
    messageId: string,
    idempotencyKey: string,
    requestId: string,
  ): Promise<ProposalMessageDeliveryPreparation | null>;
  recordResult(input: DeliveryResultInput): Promise<ProposalMessageDelivery | null>;
  get(
    token: string,
    proposalId: string,
    messageId: string,
  ): Promise<ProposalMessageDelivery | null>;
}

export class SupabaseProposalMessageDeliveryRepository
  implements ProposalMessageDeliveryRepository
{
  async canSend(token: string) {
    const [messageSend, proposalSend] = await Promise.all([
      this.permission(token, 'message.send'),
      this.permission(token, 'proposal.send'),
    ]);
    return messageSend && proposalSend;
  }

  async canRead(token: string) {
    const [messageRead, proposalRead] = await Promise.all([
      this.permission(token, 'message.read'),
      this.permission(token, 'proposal.read'),
    ]);
    return messageRead && proposalRead;
  }

  async prepareSend(
    token: string,
    proposalId: string,
    messageId: string,
    idempotencyKey: string,
    requestId: string,
  ) {
    const row = await this.rpc(token, 'prepare_proposal_message_delivery', {
      p_proposal_id: proposalId,
      p_message_id: messageId,
      p_idempotency_key: idempotencyKey,
      p_request_id: requestId,
    });
    return row ? mapPreparation(row as PreparationRow) : null;
  }

  async prepareRetry(
    token: string,
    proposalId: string,
    messageId: string,
    idempotencyKey: string,
    requestId: string,
  ) {
    const row = await this.rpc(token, 'prepare_proposal_message_retry', {
      p_proposal_id: proposalId,
      p_message_id: messageId,
      p_idempotency_key: idempotencyKey,
      p_request_id: requestId,
    });
    return row ? mapPreparation(row as PreparationRow) : null;
  }

  async recordResult(input: DeliveryResultInput) {
    const row = await this.serviceRpc('record_proposal_message_delivery_result', {
      p_attempt_id: input.attemptId,
      p_status: input.status,
      p_provider: input.provider,
      p_provider_message_id: input.providerMessageId,
      p_response_code: input.responseCode,
      p_response_payload: input.responsePayload,
      p_error_message: input.errorMessage,
    });
    return row ? mapDelivery(row as DeliveryRow) : null;
  }

  async get(token: string, proposalId: string, messageId: string) {
    const row = await this.rpc(token, 'get_proposal_message_delivery', {
      p_proposal_id: proposalId,
      p_message_id: messageId,
    });
    return row ? mapDelivery(row as DeliveryRow) : null;
  }

  private async permission(token: string, required_permission: string) {
    return (
      (await (
        await this.request(token, '/rpc/has_permission', {
          method: 'POST',
          body: JSON.stringify({ required_permission }),
        })
      ).json()) === true
    );
  }

  private async rpc(token: string, name: string, body: object) {
    return await (
      await this.request(token, `/rpc/${name}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    ).json();
  }

  private async serviceRpc(name: string, body: object) {
    const url = requiredEnv('SUPABASE_URL');
    const key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: key,
        ...(key.startsWith('sb_secret_')
          ? {}
          : { authorization: `Bearer ${key}` }),
        ...dataApiSchemaHeaders(`/rpc/${name}`),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    await assertSupabaseResponse(
      response,
      'Proposal message delivery service request failed',
    );
    return response.json();
  }

  private async request(token: string, path: string, init: RequestInit) {
    const response = await fetch(`${requiredEnv('SUPABASE_URL')}/rest/v1${path}`, {
      ...init,
      headers: {
        apikey: requiredEnv('SUPABASE_ANON_KEY'),
        authorization: `Bearer ${token}`,
        ...dataApiSchemaHeaders(path),
        'content-type': 'application/json',
        accept: 'application/json',
      },
    });
    await assertSupabaseResponse(
      response,
      'Proposal message delivery data service request failed',
    );
    return response;
  }
}

type PreparationRow = {
  batch_id: string;
  message_id: string;
  proposal_id: string;
  subject: string;
  body_text: string;
  attempts: Array<{
    attempt_id: string;
    recipient_id: string;
    recipient_type: 'to' | 'cc' | 'bcc';
    recipient_name: string | null;
    recipient_address: string;
    attempt_no: number;
  }>;
};

type DeliveryRow = {
  message_id: string;
  proposal_id: string;
  status: ProposalMessageDelivery['status'];
  sent_at: string | null;
  approved_version_id: string;
  row_version: number;
  recipients: Array<{
    id: string;
    type: 'to' | 'cc' | 'bcc';
    name: string | null;
    address: string;
    delivery_status: ProposalMessageDelivery['recipients'][number]['deliveryStatus'];
    attempts: Array<{
      id: string;
      attempt_no: number;
      status: DeliveryAttemptStatus;
      provider: string | null;
      provider_message_id: string | null;
      attempted_at: string;
      response_code: string | null;
      error_message: string | null;
    }>;
  }>;
};

function mapPreparation(row: PreparationRow): ProposalMessageDeliveryPreparation {
  return {
    batchId: row.batch_id,
    messageId: row.message_id,
    proposalId: row.proposal_id,
    subject: row.subject,
    bodyText: row.body_text,
    attempts: row.attempts.map((attempt) => ({
      attemptId: attempt.attempt_id,
      recipientId: attempt.recipient_id,
      recipientType: attempt.recipient_type,
      recipientName: attempt.recipient_name,
      recipientAddress: attempt.recipient_address,
      attemptNo: attempt.attempt_no,
    })),
  };
}

function mapDelivery(row: DeliveryRow): ProposalMessageDelivery {
  return {
    messageId: row.message_id,
    proposalId: row.proposal_id,
    status: row.status,
    sentAt: row.sent_at,
    approvedVersionId: row.approved_version_id,
    rowVersion: row.row_version,
    recipients: row.recipients.map((recipient) => ({
      id: recipient.id,
      type: recipient.type,
      name: recipient.name,
      address: recipient.address,
      deliveryStatus: recipient.delivery_status,
      attempts: recipient.attempts.map((attempt) => ({
        id: attempt.id,
        attemptNo: attempt.attempt_no,
        status: attempt.status,
        provider: attempt.provider,
        providerMessageId: attempt.provider_message_id,
        attemptedAt: attempt.attempted_at,
        responseCode: attempt.response_code,
        errorMessage: attempt.error_message,
      })),
    })),
  };
}
