import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  WorkLogInput,
  WorkLogRepository,
  WorkLogStatus,
} from './work-log-repository.js';

const statuses = new Set<WorkLogStatus>([
  'draft',
  'submitted',
  'approved',
  'rejected',
  'locked',
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])-01$/;

export function registerWorkLogRoutes(
  app: FastifyInstance,
  repository: WorkLogRepository,
): void {
  app.post(
    '/api/v1/work-logs',
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
    '/api/v1/work-logs/:id',
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
    '/api/v1/work-logs/:id/status',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseTransition(request.body);
      if (input.status === 'submitted')
        await requireManage(repository, request.user.accessToken);
      else await requireApprove(repository, request.user.accessToken);
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
    '/api/v1/work-logs',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw invalid('limit must be an integer between 1 and 200');
      if (
        query.status !== undefined &&
        (typeof query.status !== 'string' ||
          !statuses.has(query.status as WorkLogStatus))
      )
        throw invalid('status is invalid');
      if (
        query.q !== undefined &&
        (typeof query.q !== 'string' ||
          query.q.trim().length < 1 ||
          query.q.length > 100)
      )
        throw invalid('q must be between 1 and 100 characters');
      if (
        query.workMonth !== undefined &&
        (typeof query.workMonth !== 'string' ||
          !monthPattern.test(query.workMonth))
      )
        throw invalid('workMonth must be the first day of a month');
      const cursor = parseCursor(query.cursor);
      await requireRead(repository, request.user.accessToken);
      const result = await repository.list(request.user.accessToken, {
        limit,
        ...(cursor ? { cursor } : {}),
        ...(typeof query.q === 'string' ? { query: query.q.trim() } : {}),
        ...(typeof query.status === 'string'
          ? { status: query.status as WorkLogStatus }
          : {}),
        ...(typeof query.workMonth === 'string'
          ? { workMonth: query.workMonth }
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
    '/api/v1/work-logs/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      const workLog = await repository.findById(request.user.accessToken, id);
      if (!workLog)
        throw new ApiError(404, 'not_found', 'Work log was not found');
      return workLog;
    },
  );
}

async function requireRead(repository: WorkLogRepository, token: string) {
  if (!(await repository.canRead(token)))
    throw new ApiError(403, 'forbidden', 'contract.read is required');
}

async function requireManage(repository: WorkLogRepository, token: string) {
  if (!(await repository.canManage(token)))
    throw new ApiError(403, 'forbidden', 'contract.manage is required');
}

async function requireApprove(repository: WorkLogRepository, token: string) {
  if (!(await repository.canApprove(token)))
    throw new ApiError(403, 'forbidden', 'contract.approve is required');
}

function parseInput(value: unknown): WorkLogInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  const uuid = (name: string) => {
    const value = body[name];
    if (typeof value !== 'string' || !uuidPattern.test(value))
      throw invalid(`${name} must be a UUID`);
    return value;
  };
  if (typeof body.workMonth !== 'string' || !monthPattern.test(body.workMonth))
    throw invalid('workMonth must be the first day of a month');
  const optionalNumber = (name: string) => {
    const value = body[name];
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw invalid(`${name} is invalid`);
    return value;
  };
  const absenceHours = optionalNumber('absenceHours') ?? 0;
  const notes = optionalText(body.notes, 'notes', 5000);
  if (!Array.isArray(body.details) || body.details.length > 31)
    throw invalid('details is invalid');
  const dates = new Set<string>();
  const month = body.workMonth.slice(0, 7);
  const details = body.details.map((value, index) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw invalid(`details[${index}] is invalid`);
    const detail = value as Record<string, unknown>;
    if (
      typeof detail.workDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(detail.workDate) ||
      detail.workDate.slice(0, 7) !== month ||
      Number.isNaN(Date.parse(`${detail.workDate}T00:00:00Z`)) ||
      dates.has(detail.workDate)
    )
      throw invalid(`details[${index}].workDate is invalid`);
    dates.add(detail.workDate);
    if (
      typeof detail.workType !== 'string' ||
      ![
        'work',
        'paid_leave',
        'absence',
        'holiday',
        'training',
        'other',
      ].includes(detail.workType)
    )
      throw invalid(`details[${index}].workType is invalid`);
    const time = (name: string) => {
      const item = detail[name];
      if (item === null || item === undefined || item === '') return null;
      if (
        typeof item !== 'string' ||
        !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(item)
      )
        throw invalid(`details[${index}].${name} is invalid`);
      return item;
    };
    const startTime = time('startTime');
    const endTime = time('endTime');
    if (
      (startTime === null) !== (endTime === null) ||
      (startTime && endTime && endTime <= startTime)
    )
      throw invalid(`details[${index}] time range is invalid`);
    const number = (name: string, integer = false, max = 24) => {
      const item = detail[name];
      if (
        typeof item !== 'number' ||
        !Number.isFinite(item) ||
        item < 0 ||
        item > max ||
        (integer && !Number.isInteger(item))
      )
        throw invalid(`details[${index}].${name} is invalid`);
      return item;
    };
    return {
      workDate: detail.workDate,
      workType: detail.workType as WorkLogInput['details'][number]['workType'],
      startTime,
      endTime,
      breakMinutes: number('breakMinutes', true, 1440),
      workHours: number('workHours'),
      overtimeHours: number('overtimeHours'),
      description: optionalText(
        detail.description,
        `details[${index}].description`,
        1000,
      ),
    };
  });
  return {
    contractId: uuid('contractId'),
    engineerId: uuid('engineerId'),
    workMonth: body.workMonth,
    scheduledDays: optionalNumber('scheduledDays'),
    scheduledHours: optionalNumber('scheduledHours'),
    absenceHours,
    notes,
    details,
  };
}

function parseTransition(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  if (
    typeof body.status !== 'string' ||
    !['submitted', 'approved', 'rejected', 'locked'].includes(body.status)
  )
    throw invalid('status is invalid');
  const reason = optionalText(body.reason, 'reason', 1000);
  const approvedByName = optionalText(
    body.approvedByName,
    'approvedByName',
    300,
  );
  if (body.status === 'rejected' && reason === null)
    throw invalid('reason is required');
  if (body.status === 'approved' && approvedByName === null)
    throw invalid('approvedByName is required');
  return {
    status: body.status as 'submitted' | 'approved' | 'rejected' | 'locked',
    reason,
    approvedByName,
  };
}

function optionalText(value: unknown, name: string, max: number) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > max)
    throw invalid(`${name} is invalid`);
  return value.trim() || null;
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
    'Work log was changed or its contract and approval state are unavailable',
  );
}

function parseCursor(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 500)
    throw invalid('cursor is invalid');
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as { workMonth?: unknown; updatedAt?: unknown; id?: unknown };
    if (
      typeof parsed.workMonth !== 'string' ||
      !monthPattern.test(parsed.workMonth) ||
      typeof parsed.updatedAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.updatedAt)) ||
      typeof parsed.id !== 'string' ||
      !uuidPattern.test(parsed.id)
    )
      throw new Error('invalid cursor');
    return {
      workMonth: parsed.workMonth,
      updatedAt: parsed.updatedAt,
      id: parsed.id,
    };
  } catch {
    throw invalid('cursor is invalid');
  }
}

function encodeCursor(cursor: {
  workMonth: string;
  updatedAt: string;
  id: string;
}) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function invalid(message: string) {
  return new ApiError(400, 'validation_error', message);
}
