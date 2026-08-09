import type { FastifyInstance } from 'fastify';

import { ApiError } from '../../shared/errors.js';
import type { ProjectRepository } from './project-repository.js';

const statuses = new Set(['draft', 'open', 'on_hold', 'closed', 'cancelled']);
const recruitmentStatuses = new Set([
  'recruiting',
  'paused',
  'filled',
  'ended',
]);
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
        query.q !== undefined &&
        (typeof query.q !== 'string' ||
          query.q.trim().length < 1 ||
          query.q.length > 100)
      )
        throw invalid('q must be between 1 and 100 characters');
      if (
        query.recruitmentStatus !== undefined &&
        (typeof query.recruitmentStatus !== 'string' ||
          !recruitmentStatuses.has(query.recruitmentStatus))
      )
        throw invalid('recruitmentStatus is invalid');
      const cursor = parseCursor(query.cursor);
      await requireProjectRead(repository, request.user.accessToken);
      const result = await repository.list(request.user.accessToken, {
        limit,
        ...(cursor === undefined ? {} : { cursor }),
        ...(typeof query.q === 'string' ? { query: query.q.trim() } : {}),
        ...(typeof query.status === 'string' ? { status: query.status } : {}),
        ...(typeof query.recruitmentStatus === 'string'
          ? { recruitmentStatus: query.recruitmentStatus }
          : {}),
      });
      return {
        items: result.items,
        page: {
          limit,
          nextCursor:
            result.nextCursor === null ? null : encodeCursor(result.nextCursor),
        },
      };
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

function encodeCursor(cursor: { updatedAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function parseCursor(
  value: unknown,
): { updatedAt: string; id: string } | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 500)
    throw invalid('cursor is invalid');
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    if (
      typeof parsed.updatedAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.updatedAt)) ||
      typeof parsed.id !== 'string' ||
      !uuidPattern.test(parsed.id)
    )
      throw new Error('invalid cursor');
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    throw invalid('cursor is invalid');
  }
}
