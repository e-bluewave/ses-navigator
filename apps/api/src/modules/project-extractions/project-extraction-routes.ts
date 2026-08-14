import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type { ProjectExtractionRepository } from './project-extraction-repository.js';
import {
  assertProjectExtractionResult,
  type ProjectExtractor,
} from './project-extraction-service.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function registerProjectExtractionRoutes(
  app: FastifyInstance,
  repository: ProjectExtractionRepository,
  extractor: ProjectExtractor,
) {
  app.post(
    '/api/v1/projects/:id/extractions',
    { preHandler: (r) => app.authenticate(r) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, unknown>;
      const sourceText = body.sourceText;
      const sourceTitle = body.sourceTitle;
      if (
        !uuid.test(id) ||
        typeof sourceText !== 'string' ||
        sourceText.trim().length < 50 ||
        sourceText.length > 100000 ||
        (sourceTitle != null &&
          (typeof sourceTitle !== 'string' || sourceTitle.length > 300))
      )
        throw invalid();
      if (!(await repository.canExecute(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'ai.execute is required');
      const started = await repository.start(
        request.user.accessToken,
        id,
        sourceText,
        typeof sourceTitle === 'string' ? sourceTitle : null,
        extractor.provider,
        extractor.modelName,
        extractor.promptVersion,
        request.id,
      );
      try {
        const extracted = await extractor.extract(sourceText);
        await repository.complete(
          request.user.accessToken,
          started.extractionId,
          started.aiExecutionId,
          extracted.result,
          extracted.usage.inputTokens,
          extracted.usage.outputTokens,
        );
        return reply
          .code(201)
          .send(
            await repository.get(
              request.user.accessToken,
              id,
              started.extractionId,
            ),
          );
      } catch (cause) {
        await repository.fail(
          request.user.accessToken,
          started.extractionId,
          started.aiExecutionId,
          cause instanceof ApiError ? cause.code : 'ai_error',
          cause instanceof Error ? cause.message : 'AI extraction failed',
        );
        throw cause instanceof ApiError
          ? cause
          : new ApiError(
              502,
              'ai_extraction_failed',
              'Project extraction failed',
            );
      }
    },
  );
  app.get(
    '/api/v1/projects/:id/extractions/latest',
    { preHandler: (r) => app.authenticate(r) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid();
      return repository.get(request.user.accessToken, id);
    },
  );
  app.post(
    '/api/v1/projects/:id/extractions/:extractionId/review',
    { preHandler: (r) => app.authenticate(r) },
    async (request) => {
      const { id, extractionId } = request.params as {
        id: string;
        extractionId: string;
      };
      const body = request.body as Record<string, unknown>;
      if (
        !uuid.test(id) ||
        !uuid.test(extractionId) ||
        !['approved', 'rejected'].includes(String(body.decision)) ||
        (body.notes != null &&
          (typeof body.notes !== 'string' || body.notes.length > 2000)) ||
        (body.correctedResult != null &&
          typeof body.correctedResult !== 'object')
      )
        throw invalid();
      if (body.correctedResult != null)
        assertProjectExtractionResult(body.correctedResult, 400);
      if (!(await repository.canReview(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'ai.review is required');
      return repository.review(
        request.user.accessToken,
        id,
        extractionId,
        body.decision as 'approved' | 'rejected',
        body.correctedResult ?? null,
        body.notes ?? null,
        request.id,
      );
    },
  );
}
function invalid() {
  return new ApiError(
    400,
    'invalid_request',
    'project extraction request is invalid',
  );
}
