import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
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
