import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type { ContactRepository, ContactStatus } from './contact-repository.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set<ContactStatus>([
  'active',
  'inactive',
  'left_company',
  'unknown',
]);

export function registerContactRoutes(
  app: FastifyInstance,
  repository: ContactRepository,
) {
  app.get(
    '/api/v1/contacts',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw invalid('limit must be an integer between 1 and 200');
      if (
        query.companyId !== undefined &&
        (typeof query.companyId !== 'string' || !uuid.test(query.companyId))
      )
        throw invalid('companyId must be a UUID');
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
          !statuses.has(query.status as ContactStatus))
      )
        throw invalid('status is invalid');
      const cursor = parseCursor(query.cursor);
      await requireRead(repository, request.user.accessToken);
      const result = await repository.list(request.user.accessToken, {
        limit,
        ...(typeof query.companyId === 'string'
          ? { companyId: query.companyId }
          : {}),
        ...(typeof query.q === 'string' ? { q: query.q.trim() } : {}),
        ...(typeof query.status === 'string'
          ? { status: query.status as ContactStatus }
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
    '/api/v1/contacts/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      const contact = await repository.findById(request.user.accessToken, id);
      if (!contact)
        throw new ApiError(404, 'not_found', 'Contact was not found');
      return contact;
    },
  );
}
async function requireRead(repository: ContactRepository, token: string) {
  if (!(await repository.canRead(token)))
    throw new ApiError(403, 'forbidden', 'company.read permission is required');
}
function invalid(message: string) {
  return new ApiError(400, 'invalid_request', message);
}
function parseCursor(
  value: unknown,
): { updatedAt: string; id: string } | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 500)
    throw invalid('cursor is invalid');
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString(),
    ) as Record<string, unknown>;
    if (
      typeof parsed.updatedAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.updatedAt)) ||
      typeof parsed.id !== 'string' ||
      !uuid.test(parsed.id)
    )
      throw new Error();
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    throw invalid('cursor is invalid');
  }
}
