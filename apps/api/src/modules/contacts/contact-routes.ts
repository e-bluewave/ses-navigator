import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  ContactInput,
  ContactRepository,
  ContactStatus,
} from './contact-repository.js';

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
  app.post(
    '/api/v1/contacts',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const input = parseInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const contact = await repository.create(request.user.accessToken, input);
      return reply
        .code(201)
        .header('etag', `"${contact.rowVersion}"`)
        .send(contact);
    },
  );
  app.put(
    '/api/v1/contacts/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const contact = await repository.update(
        request.user.accessToken,
        id,
        rowVersion,
        input,
      );
      if (!contact)
        throw new ApiError(
          409,
          'conflict',
          'Contact was changed; reload and try again',
        );
      return reply.header('etag', `"${contact.rowVersion}"`).send(contact);
    },
  );
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
async function requireManage(repository: ContactRepository, token: string) {
  if (!(await repository.canManage(token)))
    throw new ApiError(
      403,
      'forbidden',
      'company.manage permission is required',
    );
}
function parseIfMatch(value: string | undefined) {
  const match = value?.match(/^(?:W\/)??"([1-9]\d*)"$/);
  if (!match)
    throw new ApiError(428, 'precondition_required', 'If-Match is required');
  return Number(match[1]);
}
function parseInput(value: unknown): ContactInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  const required = (name: string, max: number) => {
    const v = body[name];
    if (typeof v !== 'string' || !v.trim() || v.length > max)
      throw invalid(`${name} is invalid`);
    return v.trim();
  };
  const nullable = (name: string, max: number) => {
    const v = body[name];
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'string' || v.length > max)
      throw invalid(`${name} is invalid`);
    return v.trim();
  };
  const companyId = body.companyId;
  if (typeof companyId !== 'string' || !uuid.test(companyId))
    throw invalid('companyId must be a UUID');
  const status = body.status;
  if (typeof status !== 'string' || !statuses.has(status as ContactStatus))
    throw invalid('status is invalid');
  const email = nullable('email', 320);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw invalid('email is invalid');
  if (typeof body.isPrimary !== 'boolean')
    throw invalid('isPrimary is invalid');
  return {
    companyId,
    managementNo: required('managementNo', 32),
    familyName: required('familyName', 100),
    givenName: nullable('givenName', 100),
    departmentName: nullable('departmentName', 200),
    positionTitle: nullable('positionTitle', 200),
    email,
    phone: nullable('phone', 50),
    mobilePhone: nullable('mobilePhone', 50),
    isPrimary: body.isPrimary,
    status: status as ContactStatus,
  };
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
