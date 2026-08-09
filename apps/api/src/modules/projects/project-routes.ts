import type { FastifyInstance } from 'fastify';

import { ApiError } from '../../shared/errors.js';
import type { ProjectRepository } from './project-repository.js';

const statuses = new Set(['draft', 'open', 'on_hold', 'closed', 'cancelled']);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function registerProjectRoutes(
  app: FastifyInstance,
  repository: ProjectRepository,
): void {
  app.get(
    '/api/v1/projects',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw invalid('limit must be an integer between 1 and 200');
      if (
        query.status !== undefined &&
        (typeof query.status !== 'string' || !statuses.has(query.status))
      )
        throw invalid('status is invalid');
      if (
        query.managementNo !== undefined &&
        typeof query.managementNo !== 'string'
      )
        throw invalid('managementNo is invalid');
      await requireProjectRead(repository, request.user.accessToken);
      const items = await repository.list(request.user.accessToken, {
        limit,
        ...(typeof query.status === 'string' ? { status: query.status } : {}),
        ...(typeof query.managementNo === 'string'
          ? { managementNo: query.managementNo }
          : {}),
      });
      return { items, page: { limit, nextCursor: null } };
    },
  );

  app.get(
    '/api/v1/projects/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      await requireProjectRead(repository, request.user.accessToken);
      const project = await repository.findById(request.user.accessToken, id);
      if (project === null)
        throw new ApiError(404, 'not_found', 'Project was not found');
      return project;
    },
  );
}

async function requireProjectRead(
  repository: ProjectRepository,
  token: string,
): Promise<void> {
  if (!(await repository.canRead(token)))
    throw new ApiError(403, 'forbidden', 'project.read permission is required');
}

function invalid(message: string): ApiError {
  return new ApiError(400, 'invalid_request', message);
}
