import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  AvailabilityStatus,
  EngineerRepository,
  EngineerStatus,
} from './engineer-repository.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set<EngineerStatus>([
  'candidate',
  'active',
  'inactive',
  'retired',
  'blocked',
]);
const availabilityStatuses = new Set<AvailabilityStatus>([
  'unknown',
  'available',
  'proposed',
  'engaged',
  'unavailable',
]);

export function registerEngineerRoutes(
  app: FastifyInstance,
  repository: EngineerRepository,
) {
  app.get(
    '/api/v1/engineers',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw invalid('limit must be an integer between 1 and 200');
      if (
        query.q !== undefined &&
        (typeof query.q !== 'string' ||
          query.q.trim().length < 1 ||
          query.q.length > 100)
      )
        throw invalid('q must be between 1 and 100 characters');
      if (
        query.status !== undefined &&
        (typeof query.status !== 'string' ||
          !statuses.has(query.status as EngineerStatus))
      )
        throw invalid('status is invalid');
      if (
        query.availabilityStatus !== undefined &&
        (typeof query.availabilityStatus !== 'string' ||
          !availabilityStatuses.has(
            query.availabilityStatus as AvailabilityStatus,
          ))
      )
        throw invalid('availabilityStatus is invalid');
      const cursor = parseCursor(query.cursor);
      await requireRead(repository, request.user.accessToken);
      const result = await repository.list(request.user.accessToken, {
        limit,
        ...(typeof query.q === 'string' ? { q: query.q.trim() } : {}),
        ...(typeof query.status === 'string'
          ? { status: query.status as EngineerStatus }
          : {}),
        ...(typeof query.availabilityStatus === 'string'
          ? {
              availabilityStatus:
                query.availabilityStatus as AvailabilityStatus,
            }
          : {}),
        ...(cursor ? { cursor } : {}),
      });
      return {
        items: result.items,
        page: {
          limit,
          nextCursor: result.nextCursor
            ? Buffer.from(JSON.stringify(result.nextCursor)).toString(
                'base64url',
              )
            : null,
        },
      };
    },
  );
  app.get(
    '/api/v1/engineers/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      const engineer = await repository.findById(request.user.accessToken, id);
      if (!engineer)
        throw new ApiError(404, 'not_found', 'Engineer was not found');
      return engineer;
    },
  );
}
async function requireRead(repository: EngineerRepository, token: string) {
  if (!(await repository.canRead(token)))
    throw new ApiError(
      403,
      'forbidden',
      'engineer.read permission is required',
    );
}
function parseCursor(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw invalid('cursor is invalid');
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString(),
    ) as Record<string, unknown>;
    if (
      typeof parsed.updatedAt !== 'string' ||
      typeof parsed.id !== 'string' ||
      !uuid.test(parsed.id) ||
      Number.isNaN(Date.parse(parsed.updatedAt))
    )
      throw new Error();
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    throw invalid('cursor is invalid');
  }
}
function invalid(message: string) {
  return new ApiError(400, 'invalid_request', message);
}
