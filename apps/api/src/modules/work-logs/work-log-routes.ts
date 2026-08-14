import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
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
