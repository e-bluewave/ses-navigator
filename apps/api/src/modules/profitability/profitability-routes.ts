import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type { ProfitabilityRepository } from './profitability-repository.js';

const month = /^\d{4}-(0[1-9]|1[0-2])-01$/;
export function registerProfitabilityRoutes(
  app: FastifyInstance,
  repository: ProfitabilityRepository,
) {
  app.get(
    '/api/v1/profitability',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      if (
        typeof query.fromMonth !== 'string' ||
        !month.test(query.fromMonth) ||
        typeof query.toMonth !== 'string' ||
        !month.test(query.toMonth) ||
        query.fromMonth > query.toMonth
      )
        throw invalid('month range is invalid');
      const currency = query.currency === undefined ? 'JPY' : query.currency;
      if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency))
        throw invalid('currency is invalid');
      const end = new Date(`${query.toMonth}T00:00:00Z`);
      const start = new Date(`${query.fromMonth}T00:00:00Z`);
      if (
        (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
          end.getUTCMonth() -
          start.getUTCMonth() >
        23
      )
        throw invalid('month range is too long');
      if (!(await repository.canRead(request.user.accessToken)))
        throw new ApiError(403, 'forbidden', 'finance.read is required');
      return repository.get(
        request.user.accessToken,
        query.fromMonth,
        query.toMonth,
        currency,
      );
    },
  );
}
function invalid(message: string) {
  return new ApiError(400, 'invalid_request', message);
}
