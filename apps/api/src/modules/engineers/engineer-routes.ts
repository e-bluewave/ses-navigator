import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  AvailabilityStatus,
  EngineerRepository,
  EngineerStatus,
  EngineerInput,
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
  app.post(
    '/api/v1/engineers',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const input = parseInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const engineer = await repository.create(request.user.accessToken, input);
      return reply
        .code(201)
        .header('etag', `"${engineer.rowVersion}"`)
        .send(engineer);
    },
  );
  app.put(
    '/api/v1/engineers/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const engineer = await repository.update(
        request.user.accessToken,
        id,
        rowVersion,
        input,
      );
      if (!engineer)
        throw new ApiError(
          409,
          'conflict',
          'Engineer was changed; reload and try again',
        );
      return reply.header('etag', `"${engineer.rowVersion}"`).send(engineer);
    },
  );
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
async function requireManage(repository: EngineerRepository, token: string) {
  if (!(await repository.canManage(token)))
    throw new ApiError(
      403,
      'forbidden',
      'engineer.manage permission is required',
    );
}
function parseInput(value: unknown): EngineerInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  const required = (name: string, max: number) => {
    const item = body[name];
    if (typeof item !== 'string' || item.trim().length < 1 || item.length > max)
      throw invalid(`${name} is invalid`);
    return item.trim();
  };
  const nullable = (name: string, max: number) => {
    const item = body[name];
    if (item === null || item === undefined || item === '') return null;
    if (typeof item !== 'string' || item.length > max)
      throw invalid(`${name} is invalid`);
    return item.trim();
  };
  if (
    typeof body.status !== 'string' ||
    !statuses.has(body.status as EngineerStatus)
  )
    throw invalid('status is invalid');
  if (
    typeof body.availabilityStatus !== 'string' ||
    !availabilityStatuses.has(body.availabilityStatus as AvailabilityStatus)
  )
    throw invalid('availabilityStatus is invalid');
  const availableFrom = nullable('availableFrom', 10);
  if (availableFrom && !/^\d{4}-\d{2}-\d{2}$/.test(availableFrom))
    throw invalid('availableFrom is invalid');
  return {
    managementNo: required('managementNo', 32),
    familyName: required('familyName', 100),
    givenName: required('givenName', 100),
    displayName: nullable('displayName', 200),
    status: body.status as EngineerStatus,
    availabilityStatus: body.availabilityStatus as AvailabilityStatus,
    availableFrom,
    nearestStation: nullable('nearestStation', 200),
    summary: nullable('summary', 2000),
  };
}
function parseIfMatch(value: string | undefined) {
  const match = value?.match(/^(?:W\/)?"([1-9]\d*)"$/);
  if (!match)
    throw new ApiError(428, 'precondition_required', 'If-Match is required');
  return Number(match[1]);
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
