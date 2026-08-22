import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type { InterviewSummaryRepository } from './interview-summary-repository.js';
import {
  assertInterviewSummaryGeneration,
  type InterviewSummarizer,
  type InterviewSummaryGeneration,
} from './interview-summary-service.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function registerInterviewSummaryRoutes(
  app: FastifyInstance,
  repository: InterviewSummaryRepository,
  summarizer: InterviewSummarizer,
) {
  app.post(
    '/api/v1/interviews/:id/ai/summary',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid();
      const input = parseCreate(request.body);
      if (!(await repository.canExecute(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'ai.execute is required');
      if (!(await repository.canInterviewManage(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'interview.manage is required');
      const started = await repository.start(
        request.user.accessToken,
        id,
        input.additionalInstructions,
        summarizer.provider,
        summarizer.modelName,
        summarizer.promptVersion,
        request.id,
      );
      if (!started)
        throw new ApiError(
          409,
          'conflict',
          'Completed interview, proposal, or summary source is unavailable',
        );
      try {
        const generated = await summarizer.summarize(started.summaryInput);
        const summary = await repository.complete(
          request.user.accessToken,
          id,
          started.summary.aiExecutionId,
          generated.result,
          generated.usage.inputTokens,
          generated.usage.outputTokens,
          request.id,
        );
        return reply.code(201).header('etag', etag(summary)).send(summary);
      } catch (cause) {
        await repository.fail(
          request.user.accessToken,
          id,
          started.summary.aiExecutionId,
          cause instanceof ApiError ? cause.code : 'ai_error',
          cause instanceof Error
            ? cause.message
            : 'Interview summary generation failed',
          request.id,
        );
        throw cause instanceof ApiError
          ? cause
          : new ApiError(
              502,
              'ai_interview_summary_failed',
              'Interview summary generation failed',
            );
      }
    },
  );

  app.get(
    '/api/v1/interviews/:id/ai/summary/latest',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid();
      if (!(await repository.canInterviewRead(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'interview.read is required');
      const canRead = await Promise.all([
        repository.canAiRead(request.user.accessToken),
        repository.canReview(request.user.accessToken),
        repository.canExecute(request.user.accessToken),
      ]);
      if (!canRead.some(Boolean))
        throw new ApiError(
          403,
          'forbidden',
          'ai.read, ai.review, or ai.execute is required',
        );
      const summary = await repository.get(request.user.accessToken, id);
      return summary
        ? reply.header('etag', etag(summary)).send(summary)
        : reply.send(null);
    },
  );

  app.post(
    '/api/v1/interviews/:interviewId/ai/summary/:executionId/review',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { interviewId, executionId } = request.params as {
        interviewId: string;
        executionId: string;
      };
      if (!uuid.test(interviewId) || !uuid.test(executionId)) throw invalid();
      const reviewRowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseReview(request.body);
      if (!(await repository.canReview(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'ai.review is required');
      if (!(await repository.canInterviewManage(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'interview.manage is required');
      if (
        input.acceptedActionItemIndexes.length > 0 &&
        !(await repository.canTaskManage(request.user.accessToken))
      )
        throw new ApiError(403, 'forbidden', 'task.manage is required');
      const summary = await repository.review(
        request.user.accessToken,
        interviewId,
        executionId,
        reviewRowVersion,
        input.decision,
        input.editedResult,
        input.acceptedActionItemIndexes,
        input.reviewComment,
        request.id,
      );
      if (!summary)
        throw new ApiError(
          409,
          'conflict',
          'Interview summary was changed or already reviewed',
        );
      return reply.header('etag', etag(summary)).send(summary);
    },
  );
}

function parseCreate(value: unknown) {
  const body = value === undefined || value === null ? {} : object(value);
  const instructions = body.additionalInstructions;
  if (
    instructions !== undefined &&
    instructions !== null &&
    (typeof instructions !== 'string' || instructions.length > 2000)
  )
    throw invalid();
  return {
    additionalInstructions:
      typeof instructions === 'string' && instructions.trim()
        ? instructions.trim()
        : null,
  };
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

  const indexes = body.acceptedActionItemIndexes ?? [];
  if (
    !Array.isArray(indexes) ||
    indexes.length > 50 ||
    !indexes.every((item) => Number.isSafeInteger(item) && Number(item) >= 1) ||
    new Set(indexes).size !== indexes.length ||
    (decision === 'reject' && indexes.length > 0)
  )
    throw invalid();

  let editedResult: InterviewSummaryGeneration | null = null;
  if (body.editedResult !== undefined && body.editedResult !== null) {
    if (decision === 'reject') throw invalid();
    try {
      assertInterviewSummaryGeneration(body.editedResult);
    } catch {
      throw invalid();
    }
    editedResult = body.editedResult;
  }
  return {
    decision,
    reviewComment,
    editedResult,
    acceptedActionItemIndexes: indexes as number[],
  };
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

function etag(summary: {
  reviewRowVersion: number | null;
  rowVersion: number;
}) {
  return `"${summary.reviewRowVersion ?? summary.rowVersion}"`;
}

function invalid() {
  return new ApiError(
    400,
    'invalid_request',
    'interview summary request is invalid',
  );
}
