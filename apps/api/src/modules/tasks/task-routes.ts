import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  MyTaskUpdateInput,
  TaskRepository,
  TaskScope,
  TaskStatus,
} from './task-repository.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const scopes = new Set<TaskScope>([
  'all',
  'incomplete',
  'completed',
  'overdue',
  'today',
  'upcoming',
]);
const statuses = new Set<TaskStatus>([
  'open',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
]);

export function registerTaskRoutes(
  app: FastifyInstance,
  repository: TaskRepository,
) {
  app.get(
    '/api/v1/my-tasks',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const scope = parseScope(query.scope);
      const timeZone = parseTimeZone(query.timeZone);
      const limit = query.limit === undefined ? 100 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw invalid('limit is invalid');
      await requirePermission(repository, request.user.accessToken, false);
      return {
        items: await repository.list(request.user.accessToken, {
          scope,
          timeZone,
          limit,
        }),
      };
    },
  );

  app.patch(
    '/api/v1/my-tasks/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const id = parseId(request.params);
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseUpdate(request.body);
      await requirePermission(repository, request.user.accessToken, true);
      const task = await repository.update(
        request.user.accessToken,
        id,
        rowVersion,
        input,
      );
      if (!task)
        throw new ApiError(
          409,
          'conflict',
          'The task changed or is not assigned to the current user',
        );
      return reply.header('etag', `"${task.rowVersion}"`).send(task);
    },
  );
}

function parseScope(value: unknown): TaskScope {
  if (value === undefined || value === '') return 'incomplete';
  if (typeof value !== 'string' || !scopes.has(value as TaskScope))
    throw invalid('scope is invalid');
  return value as TaskScope;
}

function parseTimeZone(value: unknown) {
  if (value === undefined || value === '') return 'Asia/Tokyo';
  if (typeof value !== 'string' || value.length > 100)
    throw invalid('timeZone is invalid');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
  } catch {
    throw invalid('timeZone is invalid');
  }
  return value;
}

function parseUpdate(value: unknown): MyTaskUpdateInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  if (
    body.status !== undefined &&
    (typeof body.status !== 'string' ||
      !statuses.has(body.status as TaskStatus))
  )
    throw invalid('status is invalid');
  if (
    body.dueAt !== undefined &&
    (typeof body.dueAt !== 'string' || !validDateTime(body.dueAt))
  )
    throw invalid('dueAt is invalid');
  if (body.clearDueAt !== undefined && typeof body.clearDueAt !== 'boolean')
    throw invalid('clearDueAt is invalid');
  if (body.dueAt !== undefined && body.clearDueAt === true)
    throw invalid('dueAt and clearDueAt cannot be used together');
  if (
    body.reason !== undefined &&
    body.reason !== null &&
    (typeof body.reason !== 'string' || body.reason.length > 1000)
  )
    throw invalid('reason is invalid');
  if (
    body.status === undefined &&
    body.dueAt === undefined &&
    body.clearDueAt !== true
  )
    throw invalid('status or due date change is required');
  return {
    ...(body.status === undefined ? {} : { status: body.status as TaskStatus }),
    ...(body.dueAt === undefined ? {} : { dueAt: body.dueAt }),
    ...(body.clearDueAt === undefined ? {} : { clearDueAt: body.clearDueAt }),
    ...(body.reason === undefined
      ? {}
      : {
          reason:
            typeof body.reason === 'string' && body.reason.trim()
              ? body.reason.trim()
              : null,
        }),
  };
}

function validDateTime(value: string) {
  return (
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value))
  );
}

function parseId(value: unknown) {
  const id = (value as { id: string }).id;
  if (!uuid.test(id)) throw invalid('id is invalid');
  return id;
}

function parseIfMatch(value: string | string[] | undefined) {
  if (value === undefined)
    throw new ApiError(428, 'precondition_required', 'If-Match is required');
  const raw = Array.isArray(value) ? value[0] : value;
  const match = raw?.match(/^(?:W\/)?"?(\d+)"?$/);
  const rowVersion = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1)
    throw invalid('If-Match is invalid');
  return rowVersion;
}

async function requirePermission(
  repository: TaskRepository,
  token: string,
  manage: boolean,
) {
  const allowed = manage
    ? await repository.canManage(token)
    : await repository.canRead(token);
  if (!allowed)
    throw new ApiError(
      403,
      'forbidden',
      manage ? 'task.manage is required' : 'task.read is required',
    );
}

function invalid(message: string) {
  return new ApiError(400, 'invalid_request', message);
}
