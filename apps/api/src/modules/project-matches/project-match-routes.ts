import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type { ProjectMatchRepository } from './project-match-repository.js';
import type { ProjectMatchExplainer } from './project-match-service.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function registerProjectMatchRoutes(
  app: FastifyInstance,
  repository: ProjectMatchRepository,
  explainer: ProjectMatchExplainer,
) {
  app.post(
    '/api/v1/projects/:id/ai/match-engineers',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as Record<string, unknown>;
      const limit = body.limit ?? 5;
      if (
        !uuid.test(id) ||
        !Number.isInteger(limit) ||
        Number(limit) < 1 ||
        Number(limit) > 5
      )
        throw invalid();
      if (!(await repository.canExecute(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'ai.execute is required');

      const match = await repository.calculate(
        request.user.accessToken,
        id,
        Number(limit),
        explainer.provider,
        explainer.modelName,
        explainer.promptVersion,
        request.id,
      );
      try {
        const explained = await explainer.explain(match);
        return reply
          .code(201)
          .send(
            await repository.complete(
              request.user.accessToken,
              match.id,
              match.aiExecutionId,
              explained.explanation,
              explained.usage.inputTokens,
              explained.usage.outputTokens,
            ),
          );
      } catch (cause) {
        await repository.fail(
          request.user.accessToken,
          match.id,
          match.aiExecutionId,
          cause instanceof ApiError ? cause.code : 'ai_error',
          cause instanceof Error
            ? cause.message
            : 'AI match explanation failed',
        );
        throw cause instanceof ApiError
          ? cause
          : new ApiError(502, 'ai_match_failed', 'Project matching failed');
      }
    },
  );

  app.get(
    '/api/v1/projects/:id/ai/matches/latest',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid();
      return repository.get(request.user.accessToken, id);
    },
  );
}

function invalid() {
  return new ApiError(
    400,
    'invalid_request',
    'project match request is invalid',
  );
}
