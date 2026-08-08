import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('GET /health', () => {
  it('returns the service status and request ID', async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('preserves a valid caller request ID', async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({
      headers: { 'x-request-id': 'test-request-id' },
      method: 'GET',
      url: '/health',
    });

    expect(response.headers['x-request-id']).toBe('test-request-id');
  });
});
