import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  InvoiceInput,
  InvoicePaymentInput,
  InvoiceRepository,
  InvoiceStatus,
  InvoiceType,
} from './invoice-repository.js';

const statuses = new Set<InvoiceStatus>([
  'draft',
  'issued',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
  'void',
]);
const types = new Set<InvoiceType>(['sales', 'purchase']);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function registerInvoiceRoutes(
  app: FastifyInstance,
  repository: InvoiceRepository,
): void {
  app.post(
    '/api/v1/invoices',
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

  app.get(
    '/api/v1/invoices',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw invalid('limit must be an integer between 1 and 200');
      if (
        query.q !== undefined &&
        (typeof query.q !== 'string' ||
          query.q.trim().length < 1 ||
          query.q.length > 100)
      )
        throw invalid('q must be between 1 and 100 characters');
      if (
        query.status !== undefined &&
        (typeof query.status !== 'string' ||
          !statuses.has(query.status as InvoiceStatus))
      )
        throw invalid('status is invalid');
      if (
        query.invoiceType !== undefined &&
        (typeof query.invoiceType !== 'string' ||
          !types.has(query.invoiceType as InvoiceType))
      )
        throw invalid('invoiceType is invalid');
      for (const name of ['dueFrom', 'dueTo'])
        if (
          query[name] !== undefined &&
          (typeof query[name] !== 'string' ||
            !datePattern.test(query[name]) ||
            Number.isNaN(Date.parse(`${query[name]}T00:00:00Z`)))
        )
          throw invalid(`${name} is invalid`);
      if (
        typeof query.dueFrom === 'string' &&
        typeof query.dueTo === 'string' &&
        query.dueTo < query.dueFrom
      )
        throw invalid('dueTo must be on or after dueFrom');
      const cursor = parseCursor(query.cursor);
      if (!(await repository.canRead(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'finance.read is required');
      const result = await repository.list(request.user.accessToken, {
        limit,
        ...(cursor ? { cursor } : {}),
        ...(typeof query.q === 'string' ? { query: query.q.trim() } : {}),
        ...(typeof query.status === 'string'
          ? { status: query.status as InvoiceStatus }
          : {}),
        ...(typeof query.invoiceType === 'string'
          ? { invoiceType: query.invoiceType as InvoiceType }
          : {}),
        ...(typeof query.dueFrom === 'string'
          ? { dueFrom: query.dueFrom }
          : {}),
        ...(typeof query.dueTo === 'string' ? { dueTo: query.dueTo } : {}),
      });
      return {
        items: result.items,
        page: {
          limit,
          nextCursor: result.nextCursor
            ? Buffer.from(JSON.stringify(result.nextCursor)).toString(
                'base64url',
              )
            : null,
        },
      };
    },
  );

  app.get(
    '/api/v1/invoices/options',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      await requireManage(repository, request.user.accessToken);
      return {
        billingAccounts: await repository.listBillingOptions(
          request.user.accessToken,
        ),
      };
    },
  );

  app.put(
    '/api/v1/invoices/:id',
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
    '/api/v1/invoices/:id/status',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseTransition(request.body);
      await requireManage(repository, request.user.accessToken);
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

  app.post(
    '/api/v1/invoices/:id/payments',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parsePayment(request.body);
      await requireManage(repository, request.user.accessToken);
      const item = await repository.registerPayment(
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
    '/api/v1/invoices/:id/payments/:paymentId/reversal',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id, paymentId } = request.params as {
        id: string;
        paymentId: string;
      };
      if (!uuidPattern.test(id) || !uuidPattern.test(paymentId))
        throw invalid('id and paymentId must be UUIDs');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const reason = parseReversal(request.body);
      await requireManage(repository, request.user.accessToken);
      const item = await repository.reversePayment(
        request.user.accessToken,
        id,
        paymentId,
        rowVersion,
        reason,
        request.id,
      );
      if (!item) throw conflict();
      return reply.header('etag', `"${item.rowVersion}"`).send(item);
    },
  );

  app.get(
    '/api/v1/invoices/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      if (!(await repository.canRead(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'finance.read is required');
      const invoice = await repository.findById(request.user.accessToken, id);
      if (!invoice)
        throw new ApiError(404, 'not_found', 'Invoice was not found');
      return invoice;
    },
  );
}

async function requireManage(repository: InvoiceRepository, token: string) {
  if (!(await repository.canManage(token)))
    throw new ApiError(403, 'forbidden', 'finance.manage is required');
}

function parseInput(value: unknown): InvoiceInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  const text = (name: string, max: number) => {
    const item = body[name];
    if (typeof item !== 'string' || item.trim().length < 1 || item.length > max)
      throw invalid(`${name} is invalid`);
    return item.trim();
  };
  const nullableUuid = (name: string) => {
    const item = body[name];
    if (item === null || item === undefined || item === '') return null;
    if (typeof item !== 'string' || !uuidPattern.test(item))
      throw invalid(`${name} must be a UUID or null`);
    return item;
  };
  const invoiceNo = text('invoiceNo', 40);
  if (
    typeof body.invoiceType !== 'string' ||
    !types.has(body.invoiceType as InvoiceType)
  )
    throw invalid('invoiceType is invalid');
  if (
    typeof body.billingAccountId !== 'string' ||
    !uuidPattern.test(body.billingAccountId)
  )
    throw invalid('billingAccountId must be a UUID');
  const date = (name: string, nullable = false) => {
    const item = body[name];
    if (nullable && (item === null || item === undefined || item === ''))
      return null;
    if (
      typeof item !== 'string' ||
      !datePattern.test(item) ||
      Number.isNaN(Date.parse(`${item}T00:00:00Z`))
    )
      throw invalid(`${name} is invalid`);
    return item;
  };
  const billingPeriodStart = date('billingPeriodStart', true);
  const billingPeriodEnd = date('billingPeriodEnd', true);
  const issueDate = date('issueDate')!;
  const dueDate = date('dueDate')!;
  if (
    (billingPeriodStart === null) !== (billingPeriodEnd === null) ||
    (billingPeriodStart &&
      billingPeriodEnd &&
      billingPeriodEnd < billingPeriodStart)
  )
    throw invalid('billing period is invalid');
  if (dueDate < issueDate)
    throw invalid('dueDate must be on or after issueDate');
  if (typeof body.currency !== 'string' || !/^[A-Za-z]{3}$/.test(body.currency))
    throw invalid('currency is invalid');
  if (!Array.isArray(body.items) || body.items.length > 100)
    throw invalid('items is invalid');
  const items = body.items.map((value, index) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw invalid(`items[${index}] is invalid`);
    const item = value as Record<string, unknown>;
    if (
      typeof item.itemType !== 'string' ||
      ![
        'service',
        'expense',
        'adjustment',
        'discount',
        'tax_exempt',
        'other',
      ].includes(item.itemType)
    )
      throw invalid(`items[${index}].itemType is invalid`);
    if (
      typeof item.description !== 'string' ||
      item.description.trim().length < 1 ||
      item.description.length > 1000
    )
      throw invalid(`items[${index}].description is invalid`);
    const number = (name: string, minimum: number, maximum: number) => {
      const field = item[name];
      if (
        typeof field !== 'number' ||
        !Number.isFinite(field) ||
        field < minimum ||
        field > maximum
      )
        throw invalid(`items[${index}].${name} is invalid`);
      return field;
    };
    const amount = number(
      'amount',
      item.itemType === 'discount' ? -999999999999.99 : 0,
      item.itemType === 'discount' ? 0 : 999999999999.99,
    );
    const unit =
      item.unit === null || item.unit === undefined || item.unit === ''
        ? null
        : typeof item.unit === 'string' && item.unit.length <= 40
          ? item.unit.trim() || null
          : (() => {
              throw invalid(`items[${index}].unit is invalid`);
            })();
    const workLogId =
      item.workLogId === null ||
      item.workLogId === undefined ||
      item.workLogId === ''
        ? null
        : typeof item.workLogId === 'string' && uuidPattern.test(item.workLogId)
          ? item.workLogId
          : (() => {
              throw invalid(`items[${index}].workLogId is invalid`);
            })();
    return {
      itemType: item.itemType as InvoiceInput['items'][number]['itemType'],
      description: item.description.trim(),
      quantity: number('quantity', 0, 99999999),
      unit,
      unitPrice: number('unitPrice', -999999999999.99, 999999999999.99),
      taxRate: number('taxRate', 0, 100),
      amount,
      taxAmount: number('taxAmount', 0, 999999999999.99),
      workLogId,
    };
  });
  return {
    invoiceNo,
    invoiceType: body.invoiceType as InvoiceType,
    contractId: nullableUuid('contractId'),
    billingAccountId: body.billingAccountId,
    billingPeriodStart,
    billingPeriodEnd,
    issueDate,
    dueDate,
    currency: body.currency.toUpperCase(),
    items,
  };
}

function parseTransition(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  if (
    typeof body.status !== 'string' ||
    !['issued', 'sent', 'cancelled', 'void'].includes(body.status)
  )
    throw invalid('status is invalid');
  const reason =
    body.reason === null || body.reason === undefined || body.reason === ''
      ? null
      : typeof body.reason === 'string' && body.reason.length <= 1000
        ? body.reason.trim() || null
        : (() => {
            throw invalid('reason is invalid');
          })();
  if (['cancelled', 'void'].includes(body.status) && reason === null)
    throw invalid('reason is required');
  return {
    status: body.status as 'issued' | 'sent' | 'cancelled' | 'void',
    reason,
  };
}

function parsePayment(value: unknown): InvoicePaymentInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  if (
    typeof body.paymentType !== 'string' ||
    !['receipt', 'payment', 'refund', 'offset', 'other'].includes(
      body.paymentType,
    )
  )
    throw invalid('paymentType is invalid');
  if (
    typeof body.paymentDate !== 'string' ||
    !datePattern.test(body.paymentDate) ||
    Number.isNaN(Date.parse(`${body.paymentDate}T00:00:00Z`))
  )
    throw invalid('paymentDate is invalid');
  if (
    typeof body.amount !== 'number' ||
    !Number.isFinite(body.amount) ||
    body.amount <= 0
  )
    throw invalid('amount must be greater than zero');
  if (typeof body.currency !== 'string' || !/^[A-Za-z]{3}$/.test(body.currency))
    throw invalid('currency is invalid');
  const methods = [
    'bank_transfer',
    'cash',
    'credit_card',
    'direct_debit',
    'offset',
    'other',
  ] as const;
  const paymentMethod =
    body.paymentMethod === null ||
    body.paymentMethod === undefined ||
    body.paymentMethod === ''
      ? null
      : typeof body.paymentMethod === 'string' &&
          methods.includes(body.paymentMethod as (typeof methods)[number])
        ? (body.paymentMethod as (typeof methods)[number])
        : null;
  if (body.paymentMethod && paymentMethod === null)
    throw invalid('paymentMethod is invalid');
  const bankFeeAmount = body.bankFeeAmount ?? 0;
  if (
    typeof bankFeeAmount !== 'number' ||
    !Number.isFinite(bankFeeAmount) ||
    bankFeeAmount < 0
  )
    throw invalid('bankFeeAmount is invalid');
  return {
    paymentType: body.paymentType as InvoicePaymentInput['paymentType'],
    paymentDate: body.paymentDate,
    amount: body.amount,
    currency: body.currency.toUpperCase(),
    paymentMethod,
    bankFeeAmount,
  };
}

function parseReversal(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const reason = (value as Record<string, unknown>).reason;
  if (
    typeof reason !== 'string' ||
    reason.trim().length < 1 ||
    reason.length > 1000
  )
    throw invalid('reason is required');
  return reason.trim();
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
    'Invoice was changed or its billing, contract, or lifecycle state is unavailable',
  );
}

function parseCursor(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 500)
    throw invalid('cursor is invalid');
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as { issueDate?: unknown; updatedAt?: unknown; id?: unknown };
    if (
      typeof parsed.issueDate !== 'string' ||
      !datePattern.test(parsed.issueDate) ||
      typeof parsed.updatedAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.updatedAt)) ||
      typeof parsed.id !== 'string' ||
      !uuidPattern.test(parsed.id)
    )
      throw new Error();
    return {
      issueDate: parsed.issueDate,
      updatedAt: parsed.updatedAt,
      id: parsed.id,
    };
  } catch {
    throw invalid('cursor is invalid');
  }
}
function invalid(message: string) {
  return new ApiError(400, 'validation_error', message);
}
