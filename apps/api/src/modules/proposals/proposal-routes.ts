import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type { ProposalRepository } from './proposal-repository.js';
import type { ProposalInput } from './proposal-repository.js';

const statuses = new Set([
  'draft',
  'pending_approval',
  'approved',
  'sent',
  'interview_requested',
  'interviewing',
  'offered',
  'won',
  'lost',
  'withdrawn',
  'cancelled',
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function registerProposalRoutes(
  app: FastifyInstance,
  repository: ProposalRepository,
): void {
  app.post(
    '/api/v1/proposals',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const input = parseProposalInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const proposal = await repository.create(
        request.user.accessToken,
        input,
        request.id,
      );
      if (!proposal)
        throw new ApiError(
          409,
          'conflict',
          'Proposal references are unavailable; reload and try again',
        );
      return reply
        .code(201)
        .header('etag', `"${proposal.rowVersion}"`)
        .send(proposal);
    },
  );

  app.put(
    '/api/v1/proposals/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseProposalInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const proposal = await repository.update(
        request.user.accessToken,
        id,
        rowVersion,
        input,
        request.id,
      );
      if (!proposal)
        throw new ApiError(
          409,
          'conflict',
          'Proposal was changed, is no longer a draft, or is unavailable',
        );
      return reply.header('etag', `"${proposal.rowVersion}"`).send(proposal);
    },
  );

  app.post(
    '/api/v1/proposals/:id/status',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const transition = parseStatusTransition(request.body);
      if (transition.status === 'sent')
        await requireSend(repository, request.user.accessToken);
      else await requireManage(repository, request.user.accessToken);
      const proposal = await repository.transitionStatus(
        request.user.accessToken,
        id,
        rowVersion,
        transition.status,
        transition.reason,
        request.id,
      );
      if (!proposal)
        throw new ApiError(
          409,
          'conflict',
          'Proposal was changed or is unavailable; reload and try again',
        );
      return reply.header('etag', `"${proposal.rowVersion}"`).send(proposal);
    },
  );

  app.get(
    '/api/v1/proposals',
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
    '/api/v1/proposals/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      const proposal = await repository.findById(request.user.accessToken, id);
      if (!proposal)
        throw new ApiError(404, 'not_found', 'Proposal was not found');
      return proposal;
    },
  );
}

function parseProposalInput(value: unknown): ProposalInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  const text = (name: string, max: number) => {
    const item = body[name];
    if (typeof item !== 'string' || item.trim().length < 1 || item.length > max)
      throw invalid(`${name} is invalid`);
    return item.trim();
  };
  const uuid = (name: string, nullable = false) => {
    const item = body[name];
    if (nullable && (item === null || item === undefined || item === ''))
      return null;
    if (typeof item !== 'string' || !uuidPattern.test(item))
      throw invalid(`${name} must be a UUID`);
    return item;
  };
  const price = body.proposedUnitPrice;
  if (
    price !== null &&
    price !== undefined &&
    (typeof price !== 'number' || !Number.isFinite(price) || price < 0)
  )
    throw invalid('proposedUnitPrice is invalid');
  const currencyCode = text('currencyCode', 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode))
    throw invalid('currencyCode is invalid');
  return {
    managementNo: text('managementNo', 32),
    projectPositionId: uuid('projectPositionId')!,
    engineerId: uuid('engineerId')!,
    destinationCompanyId: uuid('destinationCompanyId')!,
    destinationContactId: uuid('destinationContactId', true),
    resumeVersionId: uuid('resumeVersionId', true),
    requirementVersionId: uuid('requirementVersionId', true),
    proposedUnitPrice: typeof price === 'number' ? price : null,
    currencyCode,
    proposedStartDate: parseDate(body.proposedStartDate, 'proposedStartDate'),
    validityDate: parseDate(body.validityDate, 'validityDate'),
  };
}

function parseStatusTransition(value: unknown): {
  status: string;
  reason: string | null;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  if (typeof body.status !== 'string' || !statuses.has(body.status))
    throw invalid('status is invalid');
  const rawReason = body.reason;
  if (
    rawReason !== null &&
    rawReason !== undefined &&
    (typeof rawReason !== 'string' || rawReason.length > 500)
  )
    throw invalid('reason is invalid');
  const reason =
    typeof rawReason === 'string' ? rawReason.trim() || null : null;
  if (['lost', 'withdrawn', 'cancelled'].includes(body.status) && !reason)
    throw invalid('reason is required for this status');
  return { status: body.status, reason };
}

function parseDate(value: unknown, name: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  )
    throw invalid(`${name} is invalid`);
  return value;
}

function parseIfMatch(value: string | undefined): number {
  const match = value?.match(/^(?:W\/)?"([1-9]\d*)"$/);
  if (!match)
    throw new ApiError(428, 'precondition_required', 'If-Match is required');
  return Number(match[1]);
}

async function requireManage(repository: ProposalRepository, token: string) {
  if (!(await repository.canManage(token)))
    throw new ApiError(
      403,
      'forbidden',
      'proposal.manage permission is required',
    );
}

async function requireSend(repository: ProposalRepository, token: string) {
  if (!(await repository.canSend(token)))
    throw new ApiError(
      403,
      'forbidden',
      'proposal.send permission is required',
    );
}

async function requireRead(repository: ProposalRepository, token: string) {
  if (!(await repository.canRead(token)))
    throw new ApiError(
      403,
      'forbidden',
      'proposal.read permission is required',
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
