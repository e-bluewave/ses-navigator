import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  AccountingCloseStatus,
  AccountingCloseType,
  AccountingPeriodRepository,
  AccountingPeriodTransitionInput,
} from './accounting-period-repository.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])-01$/;

export function registerAccountingPeriodRoutes(
  app: FastifyInstance,
  repository: AccountingPeriodRepository,
): void {
  app.get(
    '/api/v1/accounting-periods',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const limit = query.limit === undefined ? 24 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 120)
        throw invalid('limit must be an integer between 1 and 120');
      const fromMonth = parseOptionalMonth(query.fromMonth, 'fromMonth');
      const toMonth = parseOptionalMonth(query.toMonth, 'toMonth');
      if (fromMonth && toMonth && fromMonth > toMonth)
        throw invalid('fromMonth must not be after toMonth');
      await requireRead(repository, request.user.accessToken);
      return {
        items: await repository.list(request.user.accessToken, {
          limit,
          ...(fromMonth ? { fromMonth } : {}),
          ...(toMonth ? { toMonth } : {}),
        }),
      };
    },
  );

  app.get(
    '/api/v1/accounting-periods/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const id = parseId(request.params);
      await requireRead(repository, request.user.accessToken);
      const period = await repository.findById(request.user.accessToken, id);
      if (!period)
        throw new ApiError(404, 'not_found', 'Accounting period was not found');
      return period;
    },
  );

  app.post(
    '/api/v1/accounting-periods',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const periodMonth = parseCreateInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const period = await repository.create(
        request.user.accessToken,
        periodMonth,
        request.id,
      );
      if (!period) throw conflict();
      return reply
        .code(201)
        .header('etag', `"${period.rowVersion}"`)
        .send(period);
    },
  );

  app.post(
    '/api/v1/accounting-periods/:id/status',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const id = parseId(request.params);
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseTransitionInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const period = await repository.transitionStatus(
        request.user.accessToken,
        id,
        rowVersion,
        input,
        request.id,
      );
      if (!period) throw conflict();
      return reply.header('etag', `"${period.rowVersion}"`).send(period);
    },
  );
}

function parseId(params: unknown): string {
  const { id } = params as { id: string };
  if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
  return id;
}

function parseOptionalMonth(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !monthPattern.test(value))
    throw invalid(`${name} must be the first day of a month`);
  return value;
}

function parseCreateInput(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const periodMonth = (value as Record<string, unknown>).periodMonth;
  if (typeof periodMonth !== 'string' || !monthPattern.test(periodMonth))
    throw invalid('periodMonth must be the first day of a month');
  return periodMonth;
}

function parseTransitionInput(value: unknown): AccountingPeriodTransitionInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  if (
    typeof body.closeType !== 'string' ||
    !['sales', 'invoice', 'payment'].includes(body.closeType)
  )
    throw invalid('closeType is invalid');
  if (
    typeof body.status !== 'string' ||
    !['open', 'closed'].includes(body.status)
  )
    throw invalid('status is invalid');
  const reason = optionalText(body.reason, 'reason', 1000);
  const impactConfirmed = body.impactConfirmed === true;
  if (body.status === 'open' && (!reason || !impactConfirmed))
    throw invalid('reopening requires reason and impact confirmation');
  return {
    closeType: body.closeType as AccountingCloseType,
    status: body.status as AccountingCloseStatus,
    reason,
    impactConfirmed,
  };
}

function optionalText(value: unknown, name: string, max: number) {
  if (value === null || value === undefined || value === '') return null;
  if (
    typeof value !== 'string' ||
    value.trim().length < 1 ||
    value.length > max
  )
    throw invalid(`${name} is invalid`);
  return value.trim();
}

function parseIfMatch(value: string | string[] | undefined): number {
  if (value === undefined)
    throw new ApiError(428, 'precondition_required', 'If-Match is required');
  const raw = Array.isArray(value) ? value[0] : value;
  const match = raw?.match(/^(?:W\/)?"?(\d+)"?$/);
  const version = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(version) || version < 1)
    throw invalid('If-Match row version is required');
  return version;
}

async function requireRead(
  repository: AccountingPeriodRepository,
  token: string,
) {
  if (!(await repository.canRead(token)))
    throw new ApiError(403, 'forbidden', 'finance.read is required');
}

async function requireManage(
  repository: AccountingPeriodRepository,
  token: string,
) {
  if (!(await repository.canManage(token)))
    throw new ApiError(403, 'forbidden', 'finance.manage is required');
}

function invalid(message: string) {
  return new ApiError(400, 'invalid_request', message);
}

function conflict() {
  return new ApiError(
    409,
    'conflict',
    'Accounting period changed or the transition order is invalid',
  );
}
