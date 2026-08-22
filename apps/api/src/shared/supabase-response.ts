import { ApiError } from './errors.js';

type SupabaseError = {
  message?: unknown;
};

export async function assertSupabaseResponse(
  response: Response,
  fallbackMessage: string,
) {
  if (response.ok) return;

  const body = (await response
    .json()
    .catch(() => null)) as SupabaseError | null;
  if (body?.message === 'AI budget stop threshold reached') {
    throw new ApiError(
      429,
      'ai_budget_exceeded',
      'AI budget stop threshold reached',
    );
  }

  throw new ApiError(
    response.status === 409 ? 409 : 502,
    response.status === 409 ? 'conflict' : 'upstream_error',
    fallbackMessage,
  );
}
