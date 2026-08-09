import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  AvailabilityStatus,
  EngineerRepository,
  EngineerStatus,
  EngineerInput,
  EngineerPrivateInput,
  EngineerAffiliationInput,
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
    '/api/v1/engineers/:id/affiliations',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      return {
        items: await repository.listAffiliations(request.user.accessToken, id),
      };
    },
  );
  app.put(
    '/api/v1/engineers/:id/affiliations/:affiliationId',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id, affiliationId } = request.params as {
        id: string;
        affiliationId: string;
      };
      if (
        !uuid.test(id) ||
        (affiliationId !== 'new' && !uuid.test(affiliationId))
      )
        throw invalid('id is invalid');
      const rowVersion =
        affiliationId === 'new'
          ? parsePrivateIfMatch(request.headers['if-match'])
          : parseIfMatch(request.headers['if-match']);
      const input = parseAffiliationInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const saved = await repository.saveAffiliation(
        request.user.accessToken,
        id,
        affiliationId === 'new' ? null : affiliationId,
        rowVersion,
        input,
        request.id,
      );
      if (!saved)
        throw new ApiError(
          409,
          'conflict',
          'Affiliation was changed; reload and try again',
        );
      return reply.header('etag', `"${saved.rowVersion}"`).send(saved);
    },
  );
  app.get(
    '/api/v1/engineers/:id/private',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      if (!(await repository.canReadPrivate(request.user.accessToken)))
        throw new ApiError(
          403,
          'forbidden',
          'engineer.private.read permission is required',
        );
      const detail = await repository.findPrivate(request.user.accessToken, id);
      if (!detail)
        return reply.code(404).send({
          error: {
            code: 'not_found',
            message: 'Engineer private detail was not found',
            requestId: request.id,
          },
        });
      return reply.header('etag', `"${detail.rowVersion}"`).send(detail);
    },
  );
  app.put(
    '/api/v1/engineers/:id/private',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parsePrivateIfMatch(request.headers['if-match']);
      const input = parsePrivateInput(request.body);
      if (!(await repository.canManagePrivate(request.user.accessToken)))
        throw new ApiError(
          403,
          'forbidden',
          'engineer.private.manage permission is required',
        );
      const detail = await repository.savePrivate(
        request.user.accessToken,
        id,
        rowVersion,
        input,
        request.id,
      );
      if (!detail)
        throw new ApiError(
          409,
          'conflict',
          'Private detail was changed; reload and try again',
        );
      return reply.header('etag', `"${detail.rowVersion}"`).send(detail);
    },
  );
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
  app.delete(
    '/api/v1/engineers/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const reason = parseDeleteReason(request.body);
      await requireManage(repository, request.user.accessToken);
      const deleted = await repository.softDelete(
        request.user.accessToken,
        id,
        rowVersion,
        reason,
        request.id,
      );
      if (!deleted)
        throw new ApiError(
          409,
          'conflict',
          'Engineer was changed or is unavailable; reload and try again',
        );
      return reply.code(204).send();
    },
  );
  app.get(
    '/api/v1/engineers/:id/audit',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      if (!(await repository.canReadAudit(request.user.accessToken)))
        throw new ApiError(
          403,
          'forbidden',
          'audit.read permission is required',
        );
      return {
        items: await repository.listAudit(request.user.accessToken, id),
      };
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
function parseAffiliationInput(value: unknown): EngineerAffiliationInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const b = value as Record<string, unknown>;
  const types = new Set([
    'employee',
    'freelance',
    'partner_employee',
    'subcontractor',
    'other',
  ]);
  if (
    typeof b.companyId !== 'string' ||
    !uuid.test(b.companyId) ||
    typeof b.affiliationType !== 'string' ||
    !types.has(b.affiliationType) ||
    typeof b.startDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(b.startDate) ||
    typeof b.isPrimary !== 'boolean'
  )
    throw invalid('affiliation is invalid');
  const nullable = (name: string, max: number) =>
    b[name] === null || b[name] === undefined || b[name] === ''
      ? null
      : typeof b[name] === 'string' && b[name].length <= max
        ? b[name].trim()
        : (() => {
            throw invalid(`${name} is invalid`);
          })();
  const endDate = nullable('endDate', 10);
  if (
    endDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < b.startDate)
  )
    throw invalid('endDate is invalid');
  return {
    companyId: b.companyId,
    affiliationType:
      b.affiliationType as EngineerAffiliationInput['affiliationType'],
    contractType: nullable('contractType', 100),
    startDate: b.startDate,
    endDate,
    isPrimary: b.isPrimary,
    notes: nullable('notes', 2000),
  };
}
function parsePrivateIfMatch(value: string | undefined) {
  const match = value?.match(/^(?:W\/)?"(0|[1-9]\d*)"$/);
  if (!match)
    throw new ApiError(428, 'precondition_required', 'If-Match is required');
  return Number(match[1]);
}
function parsePrivateInput(value: unknown): EngineerPrivateInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  const nullable = (name: string, max: number) => {
    const v = body[name];
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'string' || v.length > max)
      throw invalid(`${name} is invalid`);
    return v.trim();
  };
  const birthDate = nullable('birthDate', 10);
  if (
    birthDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
      Number.isNaN(Date.parse(`${birthDate}T00:00:00Z`)))
  )
    throw invalid('birthDate is invalid');
  const gender = nullable('gender', 11);
  if (gender && !['male', 'female', 'other', 'undisclosed'].includes(gender))
    throw invalid('gender is invalid');
  const personalEmail = nullable('personalEmail', 320);
  if (personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail))
    throw invalid('personalEmail is invalid');
  return {
    birthDate,
    gender: gender as EngineerPrivateInput['gender'],
    personalEmail,
    phone: nullable('phone', 50),
    postalCode: nullable('postalCode', 8),
    prefecture: nullable('prefecture', 100),
    city: nullable('city', 200),
    addressLine: nullable('addressLine', 500),
    emergencyContact: nullable('emergencyContact', 500),
    notes: nullable('notes', 2000),
  };
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
function parseDeleteReason(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const reason = (value as Record<string, unknown>).reason;
  if (
    typeof reason !== 'string' ||
    reason.trim().length < 1 ||
    reason.length > 500
  )
    throw invalid('reason must be between 1 and 500 characters');
  return reason.trim();
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
