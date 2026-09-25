import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  ProposalMessageDelivery,
  ProposalMessageDeliveryPreparation,
  ProposalMessageDeliveryRepository,
} from './proposal-message-delivery-repository.js';
import type { ProposalMessageDeliveryProvider } from './proposal-message-delivery-service.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function registerProposalMessageDeliveryRoutes(
  app: FastifyInstance,
  repository: ProposalMessageDeliveryRepository,
  provider: ProposalMessageDeliveryProvider,
) {
  app.post(
    '/api/v1/proposals/:proposalId/messages/:messageId/send',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { proposalId, messageId } = parseIds(request.params);
      const idempotencyKey = parseIdempotencyKey(
        request.headers['idempotency-key'],
      );
      await requireSend(repository, request.user.accessToken);
      requireProvider(provider);
      const preparation = await repository.prepareSend(
        request.user.accessToken,
        proposalId,
        messageId,
        idempotencyKey,
        request.id,
      );
      if (!preparation)
        throw new ApiError(
          409,
          'conflict',
          'Message is not an approved sendable proposal message',
        );
      return deliver(repository, provider, preparation);
    },
  );

  app.post(
    '/api/v1/proposals/:proposalId/messages/:messageId/retry',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { proposalId, messageId } = parseIds(request.params);
      const idempotencyKey = parseIdempotencyKey(
        request.headers['idempotency-key'],
      );
      await requireSend(repository, request.user.accessToken);
      requireProvider(provider);
      const preparation = await repository.prepareRetry(
        request.user.accessToken,
        proposalId,
        messageId,
        idempotencyKey,
        request.id,
      );
      if (!preparation)
        throw new ApiError(
          409,
          'conflict',
          'Message has no retryable failed recipients',
        );
      return deliver(repository, provider, preparation);
    },
  );

  app.get(
    '/api/v1/proposals/:proposalId/messages/:messageId/delivery',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { proposalId, messageId } = parseIds(request.params);
      if (!(await repository.canRead(request.user.accessToken)))
        throw new ApiError(
          403,
          'forbidden',
          'message.read and proposal.read permissions are required',
        );
      const delivery = await repository.get(
        request.user.accessToken,
        proposalId,
        messageId,
      );
      if (!delivery)
        throw new ApiError(
          404,
          'not_found',
          'Proposal message delivery was not found',
        );
      return delivery;
    },
  );
}

async function deliver(
  repository: ProposalMessageDeliveryRepository,
  provider: ProposalMessageDeliveryProvider,
  preparation: ProposalMessageDeliveryPreparation,
): Promise<ProposalMessageDelivery> {
  if (preparation.attempts.length === 0)
    throw new ApiError(409, 'conflict', 'No recipients are available to send');

  let latest: ProposalMessageDelivery | null = null;
  for (const attempt of preparation.attempts) {
    try {
      const result = await provider.deliver({
        attemptId: attempt.attemptId,
        attemptNo: attempt.attemptNo,
        messageId: preparation.messageId,
        proposalId: preparation.proposalId,
        subject: preparation.subject,
        bodyText: preparation.bodyText,
        recipient: {
          id: attempt.recipientId,
          type: attempt.recipientType,
          name: attempt.recipientName,
          address: attempt.recipientAddress,
        },
      });
      latest = await repository.recordResult({
        attemptId: attempt.attemptId,
        status: result.status,
        provider: provider.name,
        providerMessageId: result.providerMessageId,
        responseCode: result.responseCode,
        responsePayload: result.responsePayload,
        errorMessage: result.errorMessage,
      });
    } catch {
      latest = await repository.recordResult({
        attemptId: attempt.attemptId,
        status: 'failed',
        provider: provider.name,
        providerMessageId: null,
        responseCode: null,
        responsePayload: null,
        errorMessage: 'Provider delivery failed',
      });
    }
    if (!latest)
      throw new ApiError(
        502,
        'message_delivery_result_failed',
        'Delivery result could not be recorded',
      );
  }

  if (!latest)
    throw new ApiError(
      502,
      'message_delivery_result_failed',
      'Delivery result could not be recorded',
    );
  return latest;
}

function parseIds(value: unknown) {
  if (!value || typeof value !== 'object')
    throw invalid('proposalId and messageId must be UUIDs');
  const { proposalId, messageId } = value as Record<string, unknown>;
  if (
    typeof proposalId !== 'string' ||
    typeof messageId !== 'string' ||
    !uuid.test(proposalId) ||
    !uuid.test(messageId)
  )
    throw invalid('proposalId and messageId must be UUIDs');
  return { proposalId, messageId };
}

function parseIdempotencyKey(value: string | string[] | undefined): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 200 ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  )
    throw invalid(
      'Idempotency-Key is required and must be 1 to 200 safe characters',
    );
  return value;
}

async function requireSend(
  repository: ProposalMessageDeliveryRepository,
  token: string,
) {
  if (!(await repository.canSend(token)))
    throw new ApiError(
      403,
      'forbidden',
      'message.send and proposal.send permissions are required',
    );
}

function requireProvider(provider: ProposalMessageDeliveryProvider) {
  if (!provider.available)
    throw new ApiError(
      503,
      'message_delivery_unavailable',
      'Proposal message delivery provider is not configured',
    );
}

function invalid(message: string) {
  return new ApiError(400, 'invalid_request', message);
}
