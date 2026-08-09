import Fastify, { type FastifyInstance } from 'fastify';

import { registerAuthentication } from './plugins/authentication.js';
import {
  registerAuthContextRoute,
  SupabaseAuthContextRepository,
} from './modules/auth/auth-context.js';
import type { AuthContextRepository } from './modules/auth/auth-context.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { SupabaseProjectRepository } from './modules/projects/project-repository.js';
import { registerProjectRoutes } from './modules/projects/project-routes.js';
import type { AuthenticationService } from './plugins/authentication.js';
import type { ProjectRepository } from './modules/projects/project-repository.js';
import { SupabaseCompanyRepository } from './modules/companies/company-repository.js';
import type { CompanyRepository } from './modules/companies/company-repository.js';
import { registerCompanyRoutes } from './modules/companies/company-routes.js';

export interface AppDependencies {
  authentication?: AuthenticationService;
  projects?: ProjectRepository;
  authContext?: AuthContextRepository;
  companies?: CompanyRepository;
}

export function buildApp(dependencies: AppDependencies = {}): FastifyInstance {
  const app = Fastify({
    genReqId: (request) => {
      const requestId = request.headers['x-request-id'];
      return typeof requestId === 'string' && requestId.length > 0
        ? requestId
        : crypto.randomUUID();
    },
  });

  registerErrorHandler(app);
  registerAuthentication(app, dependencies.authentication);

  app.addHook('onSend', (request, reply, payload, done) => {
    void reply.header('x-request-id', request.id);
    done(null, payload);
  });

  app.get('/health', () => ({ status: 'ok' as const }));

  registerAuthContextRoute(
    app,
    dependencies.authContext ?? new SupabaseAuthContextRepository(),
  );

  registerProjectRoutes(
    app,
    dependencies.projects ?? new SupabaseProjectRepository(),
  );
  registerCompanyRoutes(
    app,
    dependencies.companies ?? new SupabaseCompanyRepository(),
  );

  return app;
}
