import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type { ProposalMessageDraftRepository } from './proposal-message-draft-repository.js';
import type { ProposalMessageComposer } from './proposal-message-draft-service.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tones = new Set(['formal', 'standard', 'concise']);

export function registerProposalMessageDraftRoutes(
  app: FastifyInstance,
  repository: ProposalMessageDraftRepository,
  composer: ProposalMessageComposer,
) {
  app.post(
    '/api/v1/proposals/:id/ai/message-drafts',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid();
      const input = parseCreate(request.body);
      if (!(await repository.canExecute(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'ai.execute is required');
      if (!(await repository.canManage(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'message.manage is required');
      const started = await repository.start(
        request.user.accessToken,
        id,
        input,
        composer.provider,
        composer.modelName,
        composer.promptVersion,
        request.id,
      );
      if (!started)
        throw new ApiError(
          409,
          'conflict',
          'Proposal, destination, requirement version, or resume version is unavailable',
        );
      try {
        const generated = await composer.compose(started.compositionInput);
        const draft = await repository.complete(
          request.user.accessToken,
          started.draft.id,
          started.draft.aiExecutionId,
          generated.result,
          generated.usage.inputTokens,
          generated.usage.outputTokens,
        );
        return reply
          .code(201)
          .header('etag', `"${draft.rowVersion}"`)
          .send(draft);
      } catch (cause) {
        await repository.fail(
          request.user.accessToken,
          started.draft.id,
          started.draft.aiExecutionId,
          cause instanceof ApiError ? cause.code : 'ai_error',
          cause instanceof Error
            ? cause.message
            : 'Proposal message generation failed',
        );
        throw cause instanceof ApiError
          ? cause
          : new ApiError(
              502,
              'ai_proposal_message_failed',
              'Proposal message generation failed',
            );
      }
    },
  );

  app.get(
    '/api/v1/proposals/:id/ai/message-drafts/latest',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid();
      if (!(await repository.canRead(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'message.read is required');
      const draft = await repository.get(request.user.accessToken, id);
      return draft
        ? reply.header('etag', `"${draft.rowVersion}"`).send(draft)
        : reply.send(null);
    },
  );

  app.put(
    '/api/v1/proposals/:proposalId/ai/message-drafts/:messageId',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { proposalId, messageId } = request.params as {
        proposalId: string;
        messageId: string;
      };
      if (!uuid.test(proposalId) || !uuid.test(messageId)) throw invalid();
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseEdit(request.body);
      if (!(await repository.canManage(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'message.manage is required');
      const existing = await repository.get(
        request.user.accessToken,
        proposalId,
        messageId,
      );
      if (!existing)
        throw new ApiError(404, 'not_found', 'Proposal message was not found');
      const draft = await repository.update(
        request.user.accessToken,
        messageId,
        rowVersion,
        input.subject,
        input.bodyText,
        request.id,
      );
      if (!draft)
        throw new ApiError(
          409,
          'conflict',
          'Proposal message was changed or is no longer editable',
        );
      return reply.header('etag', `"${draft.rowVersion}"`).send(draft);
    },
  );

  app.post(
    '/api/v1/proposals/:proposalId/ai/message-drafts/:messageId/review',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { proposalId, messageId } = request.params as {
        proposalId: string;
        messageId: string;
      };
      if (!uuid.test(proposalId) || !uuid.test(messageId)) throw invalid();
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseReview(request.body);
      if (!(await repository.canReview(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'ai.review is required');
      if (!(await repository.canManage(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'message.manage is required');
      const existing = await repository.get(
        request.user.accessToken,
        proposalId,
        messageId,
      );
      if (!existing)
        throw new ApiError(404, 'not_found', 'Proposal message was not found');
      const draft = await repository.review(
        request.user.accessToken,
        messageId,
        rowVersion,
        input.decision,
        input.reviewComment,
        request.id,
      );
      if (!draft)
        throw new ApiError(
          409,
          'conflict',
          'Proposal message was changed or already reviewed',
        );
      return reply.header('etag', `"${draft.rowVersion}"`).send(draft);
    },
  );
}

function parseCreate(value: unknown) {
  const body = value === undefined || value === null ? {} : object(value);
  const tone = body.tone ?? 'standard';
  if (typeof tone !== 'string' || !tones.has(tone)) throw invalid();
  const template = body.messageTemplateId;
  if (
    template !== undefined &&
    template !== null &&
    (typeof template !== 'string' || !uuid.test(template))
  )
    throw invalid();
  const instructions = body.additionalInstructions;
  if (
    instructions !== undefined &&
    instructions !== null &&
    (typeof instructions !== 'string' || instructions.length > 2000)
  )
    throw invalid();
  return {
    messageTemplateId: typeof template === 'string' ? template : null,
    tone,
    additionalInstructions:
      typeof instructions === 'string' && instructions.trim()
        ? instructions.trim()
        : null,
  };
}

function parseEdit(value: unknown) {
  const body = object(value);
  if (
    typeof body.subject !== 'string' ||
    body.subject.trim().length < 1 ||
    body.subject.length > 200 ||
    typeof body.bodyText !== 'string' ||
    body.bodyText.trim().length < 1 ||
    body.bodyText.length > 20_000
  )
    throw invalid();
  return { subject: body.subject.trim(), bodyText: body.bodyText };
}

function parseReview(value: unknown) {
  const body = object(value);
  if (body.decision !== 'approve' && body.decision !== 'reject')
    throw invalid();
  const decision: 'approve' | 'reject' = body.decision;
  const comment = body.reviewComment;
  if (
    comment !== undefined &&
    comment !== null &&
    (typeof comment !== 'string' || comment.length > 2000)
  )
    throw invalid();
  const reviewComment =
    typeof comment === 'string' && comment.trim() ? comment.trim() : null;
  if (decision === 'reject' && reviewComment === null) throw invalid();
  return { decision, reviewComment };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}

function parseIfMatch(value: string | string[] | undefined): number {
  const text = Array.isArray(value) ? value[0] : value;
  const match = text?.match(/^(?:W\/)?"?(\d+)"?$/);
  if (!match)
    throw new ApiError(428, 'precondition_required', 'If-Match is required');
  const rowVersion = Number(match[1]);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) throw invalid();
  return rowVersion;
}

function invalid() {
  return new ApiError(
    400,
    'invalid_request',
    'proposal message request is invalid',
  );
}
