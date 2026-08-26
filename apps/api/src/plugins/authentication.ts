import type { FastifyInstance, FastifyRequest } from 'fastify';

import { ApiError } from '../shared/errors.js';

export interface AuthenticatedUser {
  id: string;
  accessToken: string;
}

export interface AuthenticationService {
  authenticate(accessToken: string): Promise<AuthenticatedUser>;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser;
  }
}

interface FetchResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

class SupabaseAuthenticationService implements AuthenticationService {
  async authenticate(accessToken: string): Promise<AuthenticatedUser> {
    const url = requiredEnv('SUPABASE_URL');
    const anonKey = requiredEnv('SUPABASE_ANON_KEY');
    const response = (await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, authorization: `Bearer ${accessToken}` },
    })) as unknown as FetchResponse;
    if (!response.ok) {
      throw new ApiError(401, 'unauthorized', 'Authentication is required');
    }
    const body = await response.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('id' in body) ||
      typeof body.id !== 'string'
    ) {
      throw new ApiError(401, 'unauthorized', 'Authentication is required');
    }
    return { id: body.id, accessToken };
  }
}

export function registerAuthentication(
  app: FastifyInstance,
  service: AuthenticationService = new SupabaseAuthenticationService(),
): void {
  app.decorateRequest('user');
  app.decorate('authenticate', async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (header === undefined || !header.startsWith('Bearer ')) {
      throw new ApiError(401, 'unauthorized', 'Authentication is required');
    }
    const token = header.slice(7).trim();
    if (token.length === 0) {
      throw new ApiError(401, 'unauthorized', 'Authentication is required');
    }
    request.user = await service.authenticate(token);
  });
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new ApiError(500, 'configuration_error', `${name} is not configured`);
  }
  return value.replace(/\/$/, '');
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest): Promise<void>;
  }
}
