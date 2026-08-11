import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type { InterviewRepository } from './interview-repository.js';
import type { InterviewInput } from './interview-repository.js';

const statuses = new Set([
  'tentative',
  'scheduled',
  'completed',
  'cancelled',
  'no_show',
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function registerInterviewRoutes(
  app: FastifyInstance,
  repository: InterviewRepository,
): void {
  app.post(
    '/api/v1/interviews',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const input = parseInterviewInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const interview = await repository.create(
        request.user.accessToken,
        input,
        request.id,
      );
      if (!interview)
        throw new ApiError(
          409,
          'conflict',
          'Interview proposal or round is unavailable; reload and try again',
        );
      return reply
        .code(201)
        .header('etag', `"${interview.rowVersion}"`)
        .send(interview);
    },
  );

  app.put(
    '/api/v1/interviews/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseInterviewInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const interview = await repository.update(
        request.user.accessToken,
        id,
        rowVersion,
        input,
        request.id,
      );
      if (!interview)
        throw new ApiError(
          409,
          'conflict',
          'Interview was changed, completed, or unavailable; reload and try again',
        );
      return reply.header('etag', `"${interview.rowVersion}"`).send(interview);
    },
  );

  app.get(
    '/api/v1/interviews',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw invalid('limit must be an integer between 1 and 200');
      if (
        query.status !== undefined &&
        (typeof query.status !== 'string' || !statuses.has(query.status))
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
    '/api/v1/interviews/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      const interview = await repository.findById(request.user.accessToken, id);
      if (!interview)
        throw new ApiError(404, 'not_found', 'Interview was not found');
      return interview;
    },
  );
}

function parseInterviewInput(value: unknown): InterviewInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  if (typeof body.proposalId !== 'string' || !uuidPattern.test(body.proposalId))
    throw invalid('proposalId must be a UUID');
  if (
    typeof body.interviewRound !== 'number' ||
    !Number.isInteger(body.interviewRound) ||
    body.interviewRound < 1 ||
    body.interviewRound > 99
  )
    throw invalid('interviewRound must be an integer between 1 and 99');
  if (
    typeof body.interviewType !== 'string' ||
    !['online', 'onsite', 'phone', 'other'].includes(body.interviewType)
  )
    throw invalid('interviewType is invalid');
  if (
    typeof body.status !== 'string' ||
    !['tentative', 'scheduled'].includes(body.status)
  )
    throw invalid('status must be tentative or scheduled');
  const scheduledStartAt = parseDateTime(
    body.scheduledStartAt,
    'scheduledStartAt',
  );
  const scheduledEndAt = parseDateTime(body.scheduledEndAt, 'scheduledEndAt');
  if ((scheduledStartAt === null) !== (scheduledEndAt === null))
    throw invalid('scheduledStartAt and scheduledEndAt must be set together');
  if (
    scheduledStartAt !== null &&
    scheduledEndAt !== null &&
    Date.parse(scheduledEndAt) <= Date.parse(scheduledStartAt)
  )
    throw invalid('scheduledEndAt must be after scheduledStartAt');
  if (body.status === 'scheduled' && scheduledStartAt === null)
    throw invalid('scheduled times are required for scheduled status');
  const meetingUrl = parseOptionalText(body.meetingUrl, 'meetingUrl', 2000);
  if (meetingUrl !== null && !/^https?:\/\//i.test(meetingUrl))
    throw invalid('meetingUrl must use http or https');
  if (
    !Array.isArray(body.scheduleCandidates) ||
    body.scheduleCandidates.length > 10
  )
    throw invalid('scheduleCandidates must contain at most 10 items');
  const scheduleCandidates = body.scheduleCandidates.map((value, index) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw invalid(`scheduleCandidates[${index}] is invalid`);
    const candidate = value as Record<string, unknown>;
    const startAt = parseDateTime(
      candidate.startAt,
      `scheduleCandidates[${index}].startAt`,
      false,
    )!;
    const endAt = parseDateTime(
      candidate.endAt,
      `scheduleCandidates[${index}].endAt`,
      false,
    )!;
    if (Date.parse(endAt) <= Date.parse(startAt))
      throw invalid(`scheduleCandidates[${index}].endAt must be after startAt`);
    return { startAt, endAt };
  });
  if (
    new Set(scheduleCandidates.map((candidate) => candidate.startAt)).size !==
    scheduleCandidates.length
  )
    throw invalid('schedule candidate start times must be unique');
  return {
    proposalId: body.proposalId,
    interviewRound: body.interviewRound,
    interviewType: body.interviewType,
    status: body.status as 'tentative' | 'scheduled',
    scheduledStartAt,
    scheduledEndAt,
    locationText: parseOptionalText(body.locationText, 'locationText', 500),
    meetingUrl,
    notes: parseOptionalText(body.notes, 'notes', 5000),
    scheduleCandidates,
  };
}

function parseDateTime(
  value: unknown,
  name: string,
  nullable = true,
): string | null {
  if (nullable && (value === null || value === undefined || value === ''))
    return null;
  if (
    typeof value !== 'string' ||
    value.length > 50 ||
    Number.isNaN(Date.parse(value))
  )
    throw invalid(`${name} is invalid`);
  return new Date(value).toISOString();
}

function parseOptionalText(value: unknown, name: string, max: number) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > max)
    throw invalid(`${name} is invalid`);
  return value.trim() || null;
}

function parseIfMatch(value: string | undefined): number {
  const match = value?.match(/^(?:W\/)?"([1-9]\d*)"$/);
  if (!match)
    throw new ApiError(428, 'precondition_required', 'If-Match is required');
  return Number(match[1]);
}

async function requireRead(repository: InterviewRepository, token: string) {
  if (!(await repository.canRead(token)))
    throw new ApiError(
      403,
      'forbidden',
      'interview.read permission is required',
    );
}

async function requireManage(repository: InterviewRepository, token: string) {
  if (!(await repository.canManage(token)))
    throw new ApiError(
      403,
      'forbidden',
      'interview.manage permission is required',
    );
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
  if (typeof value !== 'string') throw invalid('cursor is invalid');
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    if (
      typeof parsed.updatedAt !== 'string' ||
      typeof parsed.id !== 'string' ||
      !uuidPattern.test(parsed.id)
    )
      throw new Error();
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    throw invalid('cursor is invalid');
  }
}
