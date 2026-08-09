import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type { CompanyRepository } from './company-repository.js';
import type { CompanyInput } from './company-repository.js';

const statuses = new Set(['prospect', 'active', 'inactive', 'blocked']);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function registerCompanyRoutes(
  app: FastifyInstance,
  repository: CompanyRepository,
) {
  app.post(
    '/api/v1/companies',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const input = parseCompanyInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const company = await repository.create(request.user.accessToken, input);
      return reply
        .code(201)
        .header('etag', `"${company.rowVersion}"`)
        .send(company);
    },
  );

  app.put(
    '/api/v1/companies/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseCompanyInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const company = await repository.update(
        request.user.accessToken,
        id,
        rowVersion,
        input,
      );
      if (!company)
        throw new ApiError(
          409,
          'conflict',
          'Company was changed; reload and try again',
        );
      return reply.header('etag', `"${company.rowVersion}"`).send(company);
    },
  );

  app.get(
    '/api/v1/companies',
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
        (typeof query.status !== 'string' || !statuses.has(query.status))
      )
        throw invalid('status is invalid');
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
    '/api/v1/companies/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      const company = await repository.findById(request.user.accessToken, id);
      if (!company)
        throw new ApiError(404, 'not_found', 'Company was not found');
      return company;
    },
  );
}

async function requireRead(repository: CompanyRepository, token: string) {
  if (!(await repository.canRead(token)))
    throw new ApiError(403, 'forbidden', 'company.read permission is required');
}
async function requireManage(repository: CompanyRepository, token: string) {
  if (!(await repository.canManage(token)))
    throw new ApiError(
      403,
      'forbidden',
      'company.manage permission is required',
    );
}
function parseCompanyInput(value: unknown): CompanyInput {
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
  const corporateNumber = nullable('corporateNumber', 13);
  if (corporateNumber && !/^\d{13}$/.test(corporateNumber))
    throw invalid('corporateNumber is invalid');
  const websiteUrl = nullable('websiteUrl', 2048);
  if (websiteUrl) {
    try {
      const url = new URL(websiteUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      throw invalid('websiteUrl is invalid');
    }
  }
  const status = body.status;
  if (typeof status !== 'string' || !statuses.has(status))
    throw invalid('status is invalid');
  return {
    managementNo: required('managementNo', 32),
    legalName: required('legalName', 200),
    displayName: nullable('displayName', 200),
    corporateNumber,
    postalCode: nullable('postalCode', 8),
    prefecture: nullable('prefecture', 100),
    city: nullable('city', 100),
    addressLine: nullable('addressLine', 500),
    websiteUrl,
    representativeName: nullable('representativeName', 200),
    status,
  };
}
function parseIfMatch(value: string | undefined) {
  const match = value?.match(/^(?:W\/)?"([1-9]\d*)"$/);
  if (!match)
    throw new ApiError(428, 'precondition_required', 'If-Match is required');
  return Number(match[1]);
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
      throw new Error();
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    throw invalid('cursor is invalid');
  }
}
