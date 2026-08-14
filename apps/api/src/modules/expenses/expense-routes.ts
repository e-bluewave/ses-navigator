import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  ExpenseInput,
  ExpenseRepository,
  ExpenseStatus,
  ExpenseType,
} from './expense-repository.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
const statuses = new Set<ExpenseStatus>([
  'draft',
  'submitted',
  'approved',
  'rejected',
  'invoiced',
  'reimbursed',
  'cancelled',
]);
const types = new Set<ExpenseType>([
  'transportation',
  'lodging',
  'communication',
  'equipment',
  'meal',
  'other',
]);

export function registerExpenseRoutes(
  app: FastifyInstance,
  repository: ExpenseRepository,
) {
  app.get(
    '/api/v1/expenses',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw invalid('limit is invalid');
      const q = optionalText(query.q, 'q', 100);
      const status = optionalStatus(query.status);
      const dateFrom = optionalDate(query.dateFrom, 'dateFrom');
      const dateTo = optionalDate(query.dateTo, 'dateTo');
      if (dateFrom && dateTo && dateFrom > dateTo)
        throw invalid('date range is invalid');
      await requirePermission(repository, request.user.accessToken, false);
      return {
        items: await repository.list(request.user.accessToken, {
          limit,
          ...(q ? { q } : {}),
          ...(status ? { status } : {}),
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
        }),
      };
    },
  );
  app.get(
    '/api/v1/expenses/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const id = parseId(request.params);
      await requirePermission(repository, request.user.accessToken, false);
      const expense = await repository.findById(request.user.accessToken, id);
      if (!expense)
        throw new ApiError(404, 'not_found', 'Expense was not found');
      return expense;
    },
  );
  app.post(
    '/api/v1/expenses',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const input = parseInput(request.body);
      await requirePermission(repository, request.user.accessToken, true);
      const expense = await repository.save(
        request.user.accessToken,
        null,
        0,
        input,
        request.id,
      );
      if (!expense) throw conflict();
      return reply
        .code(201)
        .header('etag', `"${expense.rowVersion}"`)
        .send(expense);
    },
  );
  app.put(
    '/api/v1/expenses/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const id = parseId(request.params);
      const version = parseIfMatch(request.headers['if-match']);
      const input = parseInput(request.body);
      await requirePermission(repository, request.user.accessToken, true);
      const expense = await repository.save(
        request.user.accessToken,
        id,
        version,
        input,
        request.id,
      );
      if (!expense) throw conflict();
      return reply.header('etag', `"${expense.rowVersion}"`).send(expense);
    },
  );
  app.post(
    '/api/v1/expenses/:id/status',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const id = parseId(request.params);
      const version = parseIfMatch(request.headers['if-match']);
      const body = object(request.body);
      if (
        typeof body.status !== 'string' ||
        !statuses.has(body.status as ExpenseStatus) ||
        body.status === 'draft'
      )
        throw invalid('status is invalid');
      const reason = optionalText(body.reason, 'reason', 1000);
      if (['rejected', 'cancelled'].includes(body.status) && !reason)
        throw invalid('reason is required');
      await requirePermission(repository, request.user.accessToken, true);
      const expense = await repository.transition(
        request.user.accessToken,
        id,
        version,
        body.status as ExpenseStatus,
        reason,
        request.id,
      );
      if (!expense) throw conflict();
      return reply.header('etag', `"${expense.rowVersion}"`).send(expense);
    },
  );
}
function parseInput(value: unknown): ExpenseInput {
  const body = object(value);
  const nullableIds = ['contractId', 'workLogId', 'engineerId'] as const;
  for (const name of nullableIds)
    if (
      body[name] !== null &&
      (typeof body[name] !== 'string' || !uuid.test(body[name]))
    )
      throw invalid(`${name} is invalid`);
  if (typeof body.expenseDate !== 'string' || !date.test(body.expenseDate))
    throw invalid('expenseDate is invalid');
  if (
    typeof body.expenseType !== 'string' ||
    !types.has(body.expenseType as ExpenseType)
  )
    throw invalid('expenseType is invalid');
  if (
    typeof body.description !== 'string' ||
    body.description.trim().length < 1 ||
    body.description.length > 1000
  )
    throw invalid('description is invalid');
  if (
    typeof body.amount !== 'number' ||
    body.amount <= 0 ||
    typeof body.taxAmount !== 'number' ||
    body.taxAmount < 0 ||
    body.taxAmount > body.amount
  )
    throw invalid('amount is invalid');
  if (typeof body.currency !== 'string' || !/^[A-Z]{3}$/.test(body.currency))
    throw invalid('currency is invalid');
  if (
    typeof body.billable !== 'boolean' ||
    (body.billable && body.contractId === null)
  )
    throw invalid('billable is invalid');
  return {
    contractId: body.contractId as string | null,
    workLogId: body.workLogId as string | null,
    engineerId: body.engineerId as string | null,
    expenseDate: body.expenseDate,
    expenseType: body.expenseType as ExpenseType,
    description: body.description.trim(),
    amount: body.amount,
    taxAmount: body.taxAmount,
    currency: body.currency,
    billable: body.billable,
    receiptPath: optionalText(body.receiptPath, 'receiptPath', 2000),
    notes: optionalText(body.notes, 'notes', 5000),
  };
}
function object(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid('body is invalid');
  return value as Record<string, unknown>;
}
function parseId(value: unknown) {
  const id = (value as { id: string }).id;
  if (!uuid.test(id)) throw invalid('id is invalid');
  return id;
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
function optionalStatus(value: unknown) {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !statuses.has(value as ExpenseStatus))
    throw invalid('status is invalid');
  return value as ExpenseStatus;
}
function optionalDate(value: unknown, name: string) {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !date.test(value))
    throw invalid(`${name} is invalid`);
  return value;
}
function parseIfMatch(value: string | string[] | undefined) {
  if (value === undefined)
    throw new ApiError(428, 'precondition_required', 'If-Match is required');
  const raw = Array.isArray(value) ? value[0] : value;
  const match = raw?.match(/^(?:W\/)?"?(\d+)"?$/);
  const version = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(version) || version < 1)
    throw invalid('If-Match is invalid');
  return version;
}
async function requirePermission(
  repository: ExpenseRepository,
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
      manage ? 'finance.manage is required' : 'finance.read is required',
    );
}
function invalid(message: string) {
  return new ApiError(400, 'invalid_request', message);
}
function conflict() {
  return new ApiError(
    409,
    'conflict',
    'The expense changed or the transition is invalid',
  );
}
