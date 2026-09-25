import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  DuplicateCandidateRepository,
  DuplicateDecisionFilter,
  DuplicateEntityFilter,
  DuplicateEntityType,
  DuplicateReviewDecision,
} from './duplicate-candidate-repository.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const entityFilters = new Set<DuplicateEntityFilter>([
  'all',
  'company',
  'engineer',
  'project',
]);
const entityTypes = new Set<DuplicateEntityType>([
  'company',
  'engineer',
  'project',
]);
const decisionFilters = new Set<DuplicateDecisionFilter>([
  'all',
  'pending',
  'duplicate',
  'not_duplicate',
  'hold',
  'merged',
]);
const reviewDecisions = new Set<DuplicateReviewDecision>([
  'duplicate',
  'not_duplicate',
  'hold',
]);

export function registerDuplicateCandidateRoutes(
  app: FastifyInstance,
  repository: DuplicateCandidateRepository,
) {
  app.get(
    '/api/v1/duplicate-candidates',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const entityType = parseEntityFilter(query.entityType);
      const decision = parseDecisionFilter(query.decision);
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw invalid('limit is invalid');
      const cursor = parseCursor(query.cursor);

      if (!(await repository.canRead(request.user.accessToken, entityType)))
        throw new ApiError(
          403,
          'forbidden',
          'read permission is required for duplicate candidates',
        );

      const result = await repository.list(request.user.accessToken, {
        entityType,
        decision,
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

  app.patch(
    '/api/v1/duplicate-candidates/:entityType/:candidateId',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { entityType, candidateId } = parseParams(request.params);
      const input = parseReviewInput(request.body);

      if (!(await repository.canManage(request.user.accessToken, entityType)))
        throw new ApiError(
          403,
          'forbidden',
          `${entityType}.manage permission is required`,
        );

      return repository.review(
        request.user.accessToken,
        entityType,
        candidateId,
        input,
      );
    },
  );
}

function parseEntityFilter(value: unknown): DuplicateEntityFilter {
  if (value === undefined || value === '') return 'all';
  if (typeof value !== 'string' || !entityFilters.has(value as DuplicateEntityFilter))
    throw invalid('entityType is invalid');
  return value as DuplicateEntityFilter;
}

function parseDecisionFilter(value: unknown): DuplicateDecisionFilter {
  if (value === undefined || value === '') return 'pending';
  if (
    typeof value !== 'string' ||
    !decisionFilters.has(value as DuplicateDecisionFilter)
  )
    throw invalid('decision is invalid');
  return value as DuplicateDecisionFilter;
}

function parseParams(value: unknown) {
  const params = value as {
    entityType?: unknown;
    candidateId?: unknown;
  };
  if (
    typeof params.entityType !== 'string' ||
    !entityTypes.has(params.entityType as DuplicateEntityType)
  )
    throw invalid('entityType is invalid');
  if (typeof params.candidateId !== 'string' || !uuid.test(params.candidateId))
    throw invalid('candidateId is invalid');
  return {
    entityType: params.entityType as DuplicateEntityType,
    candidateId: params.candidateId,
  };
}

function parseReviewInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  if (
    typeof body.decision !== 'string' ||
    !reviewDecisions.has(body.decision as DuplicateReviewDecision)
  )
    throw invalid('decision is invalid');

  let note: string | null = null;
  if (body.note !== undefined && body.note !== null && body.note !== '') {
    if (typeof body.note !== 'string' || body.note.length > 2000)
      throw invalid('note is invalid');
    note = body.note.trim() || null;
  }

  return {
    decision: body.decision as DuplicateReviewDecision,
    note,
  };
}

function encodeCursor(cursor: { score: number; id: string }) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function parseCursor(
  value: unknown,
): { score: number; id: string } | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 500)
    throw invalid('cursor is invalid');
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    if (
      typeof parsed.score !== 'number' ||
      !Number.isFinite(parsed.score) ||
      parsed.score < 0 ||
      parsed.score > 1 ||
      typeof parsed.id !== 'string' ||
      !uuid.test(parsed.id)
    )
      throw new Error();
    return { score: parsed.score, id: parsed.id };
  } catch {
    throw invalid('cursor is invalid');
  }
}

function invalid(message: string) {
  return new ApiError(400, 'invalid_request', message);
}
