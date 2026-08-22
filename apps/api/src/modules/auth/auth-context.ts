import { dataApiSchemaHeaders } from '../../shared/supabase-schema.js';
import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export interface AuthContextRepository {
  requiresMfa(token: string): Promise<boolean>;
}

export class SupabaseAuthContextRepository implements AuthContextRepository {
  async requiresMfa(token: string): Promise<boolean> {
    const checks = await Promise.all([
      this.rpc(token, 'is_system_admin', {}),
      this.rpc(token, 'has_permission', { required_permission: 'user.manage' }),
      this.rpc(token, 'has_permission', { required_permission: 'role.manage' }),
    ]);
    return checks.some(Boolean);
  }

  private async rpc(token: string, name: string, body: object) {
    const response = await fetch(
      `${requiredEnv('SUPABASE_URL')}/rest/v1/rpc/${name}`,
      {
        method: 'POST',
        headers: {
          apikey: requiredEnv('SUPABASE_ANON_KEY'),
          authorization: `Bearer ${token}`,
          ...dataApiSchemaHeaders(`/rpc/${name}`),
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok)
      throw new ApiError(
        502,
        'data_api_error',
        'The data service could not complete the request',
      );
    return (await response.json()) === true;
  }
}

export function registerAuthContextRoute(
  app: import('fastify').FastifyInstance,
  repository: AuthContextRepository,
) {
  app.get(
    '/api/v1/auth/context',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => ({
      requiresMfa: await repository.requiresMfa(request.user.accessToken),
    }),
  );
}
