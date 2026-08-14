import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  EngagementInput,
  EngagementRepository,
  EngagementStatus,
} from './engagement-repository.js';

const statuses = new Set<EngagementStatus>([
  'draft',
  'preparing',
  'active',
  'ending',
  'ended',
  'cancelled',
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function registerEngagementRoutes(
  app: FastifyInstance,
  repository: EngagementRepository,
): void {
  app.post(
    '/api/v1/engagements',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const input = parseInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const item = await repository.create(
        request.user.accessToken,
        input,
        request.id,
      );
      if (!item) throw conflict();
      return reply.code(201).header('etag', `"${item.rowVersion}"`).send(item);
    },
  );

  app.put(
    '/api/v1/engagements/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const item = await repository.update(
        request.user.accessToken,
        id,
        rowVersion,
        input,
        request.id,
      );
      if (!item) throw conflict();
      return reply.header('etag', `"${item.rowVersion}"`).send(item);
    },
  );

  app.post(
    '/api/v1/engagements/:id/status',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseTransition(request.body);
      await requireManage(repository, request.user.accessToken);
      const item = await repository.transitionStatus(
        request.user.accessToken,
        id,
        rowVersion,
        input,
        request.id,
      );
      if (!item) throw conflict();
      return reply.header('etag', `"${item.rowVersion}"`).send(item);
    },
  );

  app.get(
    '/api/v1/engagements',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw invalid('limit must be an integer between 1 and 200');
      if (
        query.status !== undefined &&
        (typeof query.status !== 'string' ||
          !statuses.has(query.status as EngagementStatus))
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
        ...(typeof query.status === 'string'
          ? { status: query.status as EngagementStatus }
          : {}),
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
    '/api/v1/engagements/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      const engagement = await repository.findById(
        request.user.accessToken,
        id,
      );
      if (!engagement)
        throw new ApiError(404, 'not_found', 'Engagement was not found');
      return engagement;
    },
  );
}

async function requireRead(repository: EngagementRepository, token: string) {
  if (!(await repository.canRead(token)))
    throw new ApiError(403, 'forbidden', 'contract.read is required');
}

async function requireManage(repository: EngagementRepository, token: string) {
  if (!(await repository.canManage(token)))
    throw new ApiError(403, 'forbidden', 'contract.manage is required');
}

function parseInput(value: unknown): EngagementInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  const text = (name: string, max: number, required = false) => {
    const value = body[name];
    if (value === null || value === undefined || value === '') {
      if (required) throw invalid(`${name} is required`);
      return null;
    }
    if (typeof value !== 'string' || value.trim().length > max)
      throw invalid(`${name} is invalid`);
    if (required && value.trim().length < 1)
      throw invalid(`${name} is required`);
    return value.trim() || null;
  };
  const uuid = (name: string, required = true) => {
    const value = body[name];
    if (!required && (value === null || value === undefined || value === ''))
      return null;
    if (typeof value !== 'string' || !uuidPattern.test(value))
      throw invalid(`${name} must be a UUID`);
    return value;
  };
  const plannedStartDate = date(
    body.plannedStartDate,
    'plannedStartDate',
    true,
  )!;
  const plannedEndDate = date(body.plannedEndDate, 'plannedEndDate', false);
  if (plannedEndDate && plannedEndDate < plannedStartDate)
    throw invalid('plannedEndDate must not be before plannedStartDate');
  if (
    typeof body.condition !== 'object' ||
    body.condition === null ||
    Array.isArray(body.condition)
  )
    throw invalid('condition is invalid');
  const condition = body.condition as Record<string, unknown>;
  const number = (name: string) => {
    const value = condition[name];
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw invalid(`condition.${name} is invalid`);
    return value;
  };
  const effectiveFrom = date(
    condition.effectiveFrom,
    'condition.effectiveFrom',
    true,
  )!;
  const effectiveTo = date(
    condition.effectiveTo,
    'condition.effectiveTo',
    false,
  );
  const lower = number('settlementLowerHours');
  const upper = number('settlementUpperHours');
  if (effectiveTo && effectiveTo < effectiveFrom)
    throw invalid('condition.effectiveTo is invalid');
  if (lower !== null && upper !== null && upper < lower)
    throw invalid('condition settlement range is invalid');
  const currency = condition.currency;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency))
    throw invalid('condition.currency is invalid');
  const optionalConditionText = (name: string, max: number) => {
    const value = condition[name];
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string' || value.length > max)
      throw invalid(`condition.${name} is invalid`);
    return value.trim() || null;
  };
  return {
    engagementNo: text('engagementNo', 32, true)!,
    contractId: uuid('contractId')!,
    engineerId: uuid('engineerId')!,
    previousEngagementId: uuid('previousEngagementId', false),
    plannedStartDate,
    plannedEndDate,
    roleName: text('roleName', 300),
    workLocation: text('workLocation', 500),
    remoteFrequency: text('remoteFrequency', 200),
    condition: {
      effectiveFrom,
      effectiveTo,
      monthlySalesAmount: number('monthlySalesAmount'),
      monthlyCostAmount: number('monthlyCostAmount'),
      currency,
      settlementLowerHours: lower,
      settlementUpperHours: upper,
      notes: optionalConditionText('notes', 5000),
    },
  };
}

function parseTransition(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  if (
    typeof body.status !== 'string' ||
    !['preparing', 'active', 'ending', 'ended', 'cancelled'].includes(
      body.status,
    )
  )
    throw invalid('status is invalid');
  if (
    body.reason !== null &&
    body.reason !== undefined &&
    (typeof body.reason !== 'string' || body.reason.length > 1000)
  )
    throw invalid('reason is invalid');
  const reason =
    typeof body.reason === 'string' ? body.reason.trim() || null : null;
  if (['ended', 'cancelled'].includes(body.status) && reason === null)
    throw invalid('reason is required');
  return {
    status: body.status as
      'preparing' | 'active' | 'ending' | 'ended' | 'cancelled',
    reason,
    actualDate: date(body.actualDate, 'actualDate', false),
  };
}

function date(value: unknown, name: string, required: boolean) {
  if (value === null || value === undefined || value === '') {
    if (required) throw invalid(`${name} is required`);
    return null;
  }
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  )
    throw invalid(`${name} is invalid`);
  return value;
}

function parseIfMatch(value: string | string[] | undefined) {
  if (value === undefined)
    throw new ApiError(428, 'precondition_required', 'If-Match is required');
  const raw = Array.isArray(value) ? value[0] : value;
  const match = raw?.match(/^(?:W\/)?"?(\d+)"?$/);
  if (!match || Number(match[1]) < 1) throw invalid('If-Match is invalid');
  return Number(match[1]);
}

function conflict() {
  return new ApiError(
    409,
    'conflict',
    'Engagement was changed or its contract and lifecycle state are unavailable',
  );
}

function parseCursor(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 500)
    throw invalid('cursor is invalid');
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as { updatedAt?: unknown; id?: unknown };
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

function encodeCursor(cursor: { updatedAt: string; id: string }) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function invalid(message: string) {
  return new ApiError(400, 'validation_error', message);
}
