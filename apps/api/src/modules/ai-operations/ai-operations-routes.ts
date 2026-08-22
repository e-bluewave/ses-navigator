import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type { AiOperationsRepository } from './ai-operations-repository.js';

const date = /^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/;

export function registerAiOperationsRoutes(
  app: FastifyInstance,
  repository: AiOperationsRepository,
) {
  app.get(
    '/api/v1/ai-operations',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      if (
        typeof query.fromDate !== 'string' ||
        !date.test(query.fromDate) ||
        typeof query.toDate !== 'string' ||
        !date.test(query.toDate) ||
        query.fromDate > query.toDate
      )
        throw invalid();
      const start = new Date(`${query.fromDate}T00:00:00Z`);
      const end = new Date(`${query.toDate}T00:00:00Z`);
      if (
        !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        end.getTime() - start.getTime() > 366 * 86_400_000
      )
        throw invalid();
      if (!(await repository.canRead(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'ai.read is required');
      return repository.get(
        request.user.accessToken,
        query.fromDate,
        query.toDate,
      );
    },
  );
}

function invalid() {
  return new ApiError(400, 'invalid_request', 'AI operations range is invalid');
}
