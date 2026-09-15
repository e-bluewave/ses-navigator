import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  FollowUpPriority,
  SalesActivityCreateInput,
  SalesActivityDirection,
  SalesActivityRepository,
  SalesActivityType,
} from './sales-activity-repository.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activityTypes = new Set<SalesActivityType>([
  'call',
  'email',
  'meeting',
  'visit',
  'proposal',
  'follow_up',
  'other',
]);
const directions = new Set<SalesActivityDirection>([
  'inbound',
  'outbound',
  'internal',
]);
const priorities = new Set<FollowUpPriority>([
  'low',
  'normal',
  'high',
  'urgent',
]);

export function registerSalesActivityRoutes(
  app: FastifyInstance,
  repository: SalesActivityRepository,
) {
  app.get(
    '/api/v1/companies/:companyId/sales-activities',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const companyId = parseCompanyId(request.params);
      const query = request.query as Record<string, unknown>;
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw invalid('limit is invalid');
      const cursor = parseCursor(query.cursor);
      if (!(await repository.canRead(request.user.accessToken)))
        throw new ApiError(
          403,
          'forbidden',
          'company.read permission is required',
        );
      const result = await repository.list(request.user.accessToken, companyId, {
        limit,
        ...(cursor ? { cursor } : {}),
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

  app.post(
    '/api/v1/companies/:companyId/sales-activities',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const companyId = parseCompanyId(request.params);
      const input = parseCreateInput(request.body);
      if (request.id.length > 200) throw invalid('request id is invalid');
      if (!(await repository.canManage(request.user.accessToken)))
        throw new ApiError(
          403,
          'forbidden',
          'company.manage permission is required',
        );
      if (
        input.followUp &&
        !(await repository.canManageTasks(request.user.accessToken))
      )
        throw new ApiError(
          403,
          'forbidden',
          'task.manage permission is required for follow-up creation',
        );
      const created = await repository.create(
        request.user.accessToken,
        companyId,
        input,
        request.id,
      );
      return reply.code(201).send(created);
    },
  );
}

function parseCompanyId(value: unknown) {
  const companyId = (value as { companyId?: unknown }).companyId;
  if (typeof companyId !== 'string' || !uuid.test(companyId))
    throw invalid('companyId is invalid');
  return companyId;
}

function parseCreateInput(value: unknown): SalesActivityCreateInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;

  const activityType = body.activityType;
  if (
    typeof activityType !== 'string' ||
    !activityTypes.has(activityType as SalesActivityType)
  )
    throw invalid('activityType is invalid');

  const direction = nullableEnum(
    body.direction,
    directions,
    'direction',
  ) as SalesActivityDirection | null;
  const occurredAt = requiredDateTime(body.occurredAt, 'occurredAt');
  const subject = requiredText(body.subject, 300, 'subject');
  const summary = requiredText(body.summary, 10000, 'summary');
  const result = nullableText(body.result, 10000, 'result');
  const companyContactId = nullableUuid(
    body.companyContactId,
    'companyContactId',
  );
  const projectId = nullableUuid(body.projectId, 'projectId');
  const engineerId = nullableUuid(body.engineerId, 'engineerId');

  let followUp: SalesActivityCreateInput['followUp'] = null;
  if (body.followUp !== undefined && body.followUp !== null) {
    if (typeof body.followUp !== 'object' || Array.isArray(body.followUp))
      throw invalid('followUp is invalid');
    const followUpBody = body.followUp as Record<string, unknown>;
    const priority =
      followUpBody.priority === undefined || followUpBody.priority === ''
        ? 'normal'
        : followUpBody.priority;
    if (
      typeof priority !== 'string' ||
      !priorities.has(priority as FollowUpPriority)
    )
      throw invalid('followUp.priority is invalid');
    followUp = {
      title: requiredText(followUpBody.title, 300, 'followUp.title'),
      description: nullableText(
        followUpBody.description,
        10000,
        'followUp.description',
      ),
      dueAt: requiredDateTime(followUpBody.dueAt, 'followUp.dueAt'),
      priority: priority as FollowUpPriority,
    };
  }

  return {
    activityType: activityType as SalesActivityType,
    direction,
    occurredAt,
    subject,
    summary,
    result,
    companyContactId,
    projectId,
    engineerId,
    followUp,
  };
}

function requiredText(value: unknown, max: number, name: string) {
  if (typeof value !== 'string') throw invalid(`${name} is invalid`);
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > max)
    throw invalid(`${name} is invalid`);
  return normalized;
}

function nullableText(value: unknown, max: number, name: string) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max)
    throw invalid(`${name} is invalid`);
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function nullableUuid(value: unknown, name: string) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !uuid.test(value))
    throw invalid(`${name} is invalid`);
  return value;
}

function nullableEnum<T extends string>(
  value: unknown,
  allowed: Set<T>,
  name: string,
): T | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !allowed.has(value as T))
    throw invalid(`${name} is invalid`);
  return value as T;
}

function requiredDateTime(value: unknown, name: string) {
  if (typeof value !== 'string' || !validDateTime(value))
    throw invalid(`${name} is invalid`);
  return value;
}

function validDateTime(value: string) {
  return (
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value))
  );
}

function encodeCursor(cursor: { occurredAt: string; id: string }) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function parseCursor(
  value: unknown,
): { occurredAt: string; id: string } | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 500)
    throw invalid('cursor is invalid');
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    if (
      typeof parsed.occurredAt !== 'string' ||
      !validDateTime(parsed.occurredAt) ||
      typeof parsed.id !== 'string' ||
      !uuid.test(parsed.id)
    )
      throw new Error();
    return { occurredAt: parsed.occurredAt, id: parsed.id };
  } catch {
    throw invalid('cursor is invalid');
  }
}

function invalid(message: string) {
  return new ApiError(400, 'invalid_request', message);
}
