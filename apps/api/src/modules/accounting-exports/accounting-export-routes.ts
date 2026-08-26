import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  AccountingExportFormat,
  AccountingExportRepository,
} from './accounting-export-repository.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const formats = new Set<AccountingExportFormat>([
  'generic_csv',
  'freee',
  'money_forward',
  'yayoi',
]);

export function registerAccountingExportRoutes(
  app: FastifyInstance,
  repository: AccountingExportRepository,
) {
  app.get(
    '/api/v1/accounting-exports',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw invalid('limit is invalid');
      if (
        query.accountingPeriodId !== undefined &&
        (typeof query.accountingPeriodId !== 'string' ||
          !uuid.test(query.accountingPeriodId))
      )
        throw invalid('accountingPeriodId is invalid');
      await requirePermission(repository, request.user.accessToken, false);
      return {
        items: await repository.list(request.user.accessToken, {
          limit,
          ...(typeof query.accountingPeriodId === 'string'
            ? { accountingPeriodId: query.accountingPeriodId }
            : {}),
        }),
      };
    },
  );
  app.get(
    '/api/v1/accounting-exports/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const id = parseId(request.params);
      await requirePermission(repository, request.user.accessToken, false);
      const batch = await repository.findById(request.user.accessToken, id);
      if (!batch)
        throw new ApiError(
          404,
          'not_found',
          'Accounting export batch was not found',
        );
      return batch;
    },
  );
  app.post(
    '/api/v1/accounting-exports',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const body = object(request.body);
      if (
        typeof body.accountingPeriodId !== 'string' ||
        !uuid.test(body.accountingPeriodId)
      )
        throw invalid('accountingPeriodId is invalid');
      if (
        typeof body.exportFormat !== 'string' ||
        !formats.has(body.exportFormat as AccountingExportFormat)
      )
        throw invalid('exportFormat is invalid');
      await requirePermission(repository, request.user.accessToken, true);
      const batch = await repository.generate(
        request.user.accessToken,
        body.accountingPeriodId,
        body.exportFormat as AccountingExportFormat,
        request.id,
      );
      if (!batch) throw conflict();
      return reply
        .code(201)
        .header('etag', `"${batch.rowVersion}"`)
        .send(batch);
    },
  );
  app.post(
    '/api/v1/accounting-exports/:id/exported',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const id = parseId(request.params);
      const version = parseIfMatch(request.headers['if-match']);
      const body = object(request.body);
      let reference: string | null = null;
      if (
        body.exportReference !== null &&
        body.exportReference !== undefined &&
        body.exportReference !== ''
      ) {
        if (
          typeof body.exportReference !== 'string' ||
          body.exportReference.length > 1000
        )
          throw invalid('exportReference is invalid');
        reference = body.exportReference;
      }
      await requirePermission(repository, request.user.accessToken, true);
      const batch = await repository.markExported(
        request.user.accessToken,
        id,
        version,
        reference,
        request.id,
      );
      if (!batch) throw conflict();
      return reply.header('etag', `"${batch.rowVersion}"`).send(batch);
    },
  );
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
function parseIfMatch(value: string | string[] | undefined) {
  if (value === undefined)
    throw new ApiError(428, 'precondition_required', 'If-Match is required');
  const raw = Array.isArray(value) ? value[0] : value;
  const match = raw?.match(/^(?:W\/)?"?(\d+)"?$/);
  if (!match || Number(match[1]) < 1) throw invalid('If-Match is invalid');
  return Number(match[1]);
}
async function requirePermission(
  repository: AccountingExportRepository,
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
    'The period is not fully closed or the export batch changed',
  );
}
