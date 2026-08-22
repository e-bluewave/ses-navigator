import { describe, expect, it } from 'vitest';
import { assertSupabaseResponse } from '../src/shared/supabase-response.js';

describe('assertSupabaseResponse', () => {
  it('maps an AI budget stop to a rate-limit response', async () => {
    const response = new Response(
      JSON.stringify({ message: 'AI budget stop threshold reached' }),
      { status: 400 },
    );

    await expect(
      assertSupabaseResponse(response, 'failed'),
    ).rejects.toMatchObject({
      statusCode: 429,
      code: 'ai_budget_exceeded',
    });
  });

  it('preserves conflict responses', async () => {
    const response = new Response('{}', { status: 409 });

    await expect(
      assertSupabaseResponse(response, 'failed'),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'conflict',
    });
  });

  it('maps other failures to an upstream error', async () => {
    const response = new Response('{}', { status: 400 });

    await expect(
      assertSupabaseResponse(response, 'failed'),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: 'upstream_error',
      message: 'failed',
    });
  });
});
