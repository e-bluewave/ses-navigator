import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type { ResumeExtractionRepository } from './resume-extraction-repository.js';
import type { ResumeExtractor } from './resume-extraction-service.js';
import { assertResumeExtractionResult } from './resume-extraction-service.js';
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function registerResumeExtractionRoutes(
  app: FastifyInstance,
  repository: ResumeExtractionRepository,
  extractor: ResumeExtractor,
) {
  app.post(
    '/api/v1/engineers/:id/resume-versions/:versionId/extractions',
    { preHandler: (r) => app.authenticate(r) },
    async (request, reply) => {
      const { id, versionId } = request.params as {
        id: string;
        versionId: string;
      };
      const sourceText = (request.body as { sourceText?: unknown })?.sourceText;
      if (
        !uuid.test(id) ||
        !uuid.test(versionId) ||
        typeof sourceText !== 'string' ||
        sourceText.trim().length < 50 ||
        sourceText.length > 100000
      )
        throw invalid();
      if (!(await repository.canExecute(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'ai.execute is required');
      const started = await repository.start(
        request.user.accessToken,
        id,
        versionId,
        sourceText,
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
          request.id,
        );
        const result = await repository.get(
          request.user.accessToken,
          id,
          versionId,
          started.extractionId,
        );
        return reply.code(201).send(result);
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
              'Resume extraction failed',
            );
      }
    },
  );
  app.get(
    '/api/v1/engineers/:id/resume-versions/:versionId/extractions/latest',
    { preHandler: (r) => app.authenticate(r) },
    async (request) => {
      const { id, versionId } = request.params as {
        id: string;
        versionId: string;
      };
      if (!uuid.test(id) || !uuid.test(versionId)) throw invalid();
      return repository.get(request.user.accessToken, id, versionId);
    },
  );
  app.post(
    '/api/v1/engineers/:id/resume-versions/:versionId/extractions/:extractionId/review',
    { preHandler: (r) => app.authenticate(r) },
    async (request) => {
      const { id, versionId, extractionId } = request.params as {
        id: string;
        versionId: string;
        extractionId: string;
      };
      const b = request.body as Record<string, unknown>;
      if (
        !uuid.test(id) ||
        !uuid.test(versionId) ||
        !uuid.test(extractionId) ||
        !['approved', 'rejected'].includes(String(b.decision)) ||
        (b.notes !== null &&
          b.notes !== undefined &&
          (typeof b.notes !== 'string' || b.notes.length > 2000)) ||
        (b.correctedResult !== null &&
          b.correctedResult !== undefined &&
          typeof b.correctedResult !== 'object')
      )
        throw invalid();
      if (b.correctedResult != null)
        assertResumeExtractionResult(b.correctedResult, 400);
      if (!(await repository.canReview(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'ai.review is required');
      return repository.review(
        request.user.accessToken,
        id,
        versionId,
        extractionId,
        b.decision as 'approved' | 'rejected',
        b.correctedResult ?? null,
        b.notes ?? null,
        request.id,
      );
    },
  );
}
function invalid() {
  return new ApiError(
    400,
    'invalid_request',
    'resume extraction request is invalid',
  );
}
