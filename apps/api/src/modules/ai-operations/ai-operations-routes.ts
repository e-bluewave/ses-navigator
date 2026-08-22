import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  AiBudgetPolicyInput,
  AiOperationsRepository,
} from './ai-operations-repository.js';

const date = /^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/;

export function registerAiOperationsRoutes(
  app: FastifyInstance,
  repository: AiOperationsRepository,
) {
  app.get(
    '/api/v1/ai-operations',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      if (
        typeof query.fromDate !== 'string' ||
        !date.test(query.fromDate) ||
        typeof query.toDate !== 'string' ||
        !date.test(query.toDate) ||
        query.fromDate > query.toDate
      )
        throw invalid();
      const start = new Date(`${query.fromDate}T00:00:00Z`);
      const end = new Date(`${query.toDate}T00:00:00Z`);
      if (
        !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        end.getTime() - start.getTime() > 366 * 86_400_000
      )
        throw invalid();
      if (!(await repository.canRead(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'ai.read is required');
      return repository.get(
        request.user.accessToken,
        query.fromDate,
        query.toDate,
      );
    },
  );

  app.get(
    '/api/v1/ai-operations/budget',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const [canRead, canManage] = await Promise.all([
        repository.canRead(request.user.accessToken),
        repository.canManage(request.user.accessToken),
      ]);
      if (!canRead && !canManage)
        throw new ApiError(
          403,
          'forbidden',
          'ai.read or tenant.manage is required',
        );
      const budget = await repository.getBudget(request.user.accessToken);
      return reply
        .header('etag', etag(budget.rowVersion))
        .send({ ...budget, canManage });
    },
  );

  app.put(
    '/api/v1/ai-operations/budget',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseBudget(request.body);
      if (!(await repository.canManage(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'tenant.manage is required');
      const saved = await repository.saveBudget(
        request.user.accessToken,
        rowVersion,
        input,
        request.id,
      );
      if (!saved)
        throw new ApiError(
          409,
          'conflict',
          'AI budget policy was changed by another user',
        );
      return reply
        .header('etag', etag(saved.rowVersion))
        .send({ ...saved, canManage: true });
    },
  );
}

function parseBudget(value: unknown): AiBudgetPolicyInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid();
  const body = value as Record<string, unknown>;
  if (
    typeof body.enabled !== 'boolean' ||
    typeof body.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(body.currency)
  )
    throw invalid();
  const input: AiBudgetPolicyInput = {
    enabled: body.enabled,
    currency: body.currency,
    dailyWarningAmount: amount(body.dailyWarningAmount),
    dailyStopAmount: amount(body.dailyStopAmount),
    monthlyWarningAmount: amount(body.monthlyWarningAmount),
    monthlyStopAmount: amount(body.monthlyStopAmount),
    dailyWarningExecutions: count(body.dailyWarningExecutions),
    dailyStopExecutions: count(body.dailyStopExecutions),
    monthlyWarningExecutions: count(body.monthlyWarningExecutions),
    monthlyStopExecutions: count(body.monthlyStopExecutions),
  };
  if (
    greater(input.dailyWarningAmount, input.dailyStopAmount) ||
    greater(input.monthlyWarningAmount, input.monthlyStopAmount) ||
    greater(input.dailyWarningExecutions, input.dailyStopExecutions) ||
    greater(input.monthlyWarningExecutions, input.monthlyStopExecutions) ||
    (input.enabled &&
      input.dailyStopAmount === null &&
      input.monthlyStopAmount === null &&
      input.dailyStopExecutions === null &&
      input.monthlyStopExecutions === null)
  )
    throw invalid();
  return input;
}

function amount(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1_000_000_000
  )
    throw invalid();
  return value;
}

function count(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (
    !Number.isInteger(value) ||
    (value as number) < 1 ||
    (value as number) > 10_000_000
  )
    throw invalid();
  return value as number;
}

function greater(left: number | null, right: number | null) {
  return left !== null && right !== null && left > right;
}

function parseIfMatch(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw)
    throw new ApiError(428, 'precondition_required', 'If-Match is required');
  const match = /^(?:W\/)?"(\d+)"$/.exec(raw);
  if (!match) throw invalid();
  return Number(match[1]);
}

function etag(rowVersion: number) {
  return `W/"${rowVersion}"`;
}

function invalid() {
  return new ApiError(400, 'invalid_request', 'AI operations range is invalid');
}
