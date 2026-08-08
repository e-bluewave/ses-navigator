import type { FastifyInstance } from 'fastify';

import { ApiError } from '../shared/errors.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const known = error instanceof ApiError;
    const status = known ? error.statusCode : 500;
    void reply.status(status).send({
      error: {
        code: known ? error.code : 'internal_error',
        message: known ? error.message : 'An unexpected error occurred',
        requestId: request.id,
      },
    });
  });
}
