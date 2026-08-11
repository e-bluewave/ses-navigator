import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type { InterviewRepository } from './interview-repository.js';

const statuses = new Set([
  'tentative',
  'scheduled',
  'completed',
  'cancelled',
  'no_show',
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function registerInterviewRoutes(
  app: FastifyInstance,
  repository: InterviewRepository,
): void {
  app.get(
    '/api/v1/interviews',
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
      const cursor = parseCursor(query.cursor);
      await requireRead(repository, request.user.accessToken);
      const result = await repository.list(request.user.accessToken, {
        limit,
        ...(cursor ? { cursor } : {}),
        ...(typeof query.q === 'string' ? { query: query.q.trim() } : {}),
        ...(typeof query.status === 'string' ? { status: query.status } : {}),
      });
      return {
        items: result.items,
        page: {
          limit,
          nextCursor: result.nextCursor
            ? encodeCursor(result.nextCursor)
            : null,
        },
      };
    },
  );

  app.get(
    '/api/v1/interviews/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      const interview = await repository.findById(request.user.accessToken, id);
      if (!interview)
        throw new ApiError(404, 'not_found', 'Interview was not found');
      return interview;
    },
  );
}

async function requireRead(repository: InterviewRepository, token: string) {
  if (!(await repository.canRead(token)))
    throw new ApiError(
      403,
      'forbidden',
      'interview.read permission is required',
    );
}

function invalid(message: string) {
  return new ApiError(400, 'invalid_request', message);
}
function encodeCursor(cursor: { updatedAt: string; id: string }) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}
function parseCursor(
  value: unknown,
): { updatedAt: string; id: string } | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw invalid('cursor is invalid');
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    if (
      typeof parsed.updatedAt !== 'string' ||
      typeof parsed.id !== 'string' ||
      !uuidPattern.test(parsed.id)
    )
      throw new Error();
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    throw invalid('cursor is invalid');
  }
}
