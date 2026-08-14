import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type { SalesKpiRepository } from './sales-kpi-repository.js';

const date = /^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/;
export function registerSalesKpiRoutes(
  app: FastifyInstance,
  repository: SalesKpiRepository,
) {
  app.get(
    '/api/v1/sales-kpi',
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
        throw invalid('date range is invalid');
      const expiryDays =
        query.contractExpiryDays === undefined
          ? 60
          : Number(query.contractExpiryDays);
      const start = new Date(`${query.fromDate}T00:00:00Z`);
      const end = new Date(`${query.toDate}T00:00:00Z`);
      if (
        !Number.isInteger(expiryDays) ||
        expiryDays < 1 ||
        expiryDays > 365 ||
        end.getTime() - start.getTime() > 730 * 86_400_000
      )
        throw invalid('dashboard range is invalid');
      if (!(await repository.canRead(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'proposal.read is required');
      return repository.get(
        request.user.accessToken,
        query.fromDate,
        query.toDate,
        expiryDays,
      );
    },
  );
}
function invalid(message: string) {
  return new ApiError(400, 'invalid_request', message);
}
