export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email: string };
}

export interface AuthService {
  getSession: () => Promise<AuthSession | null>;
  signIn: (email: string, password: string) => Promise<AuthSession>;
  signOut: () => Promise<void>;
  onSessionChange: (
    listener: (session: AuthSession | null) => void,
  ) => () => void;
}

type SupabaseSessionResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  expires_at?: unknown;
  user?: { id?: unknown; email?: unknown };
};

const storageKey = 'sesn.auth.session';
const refreshMarginSeconds = 60;

export class AuthenticationError extends Error {}

export function createSupabaseAuthService(options: {
  url: string;
  publishableKey: string;
  fetch?: typeof fetch;
  storage?: Storage;
  now?: () => number;
}): AuthService {
  const request = options.fetch ?? fetch;
  const storage = options.storage ?? localStorage;
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<(session: AuthSession | null) => void>();
  let session = readSession(storage);
  let refreshPromise: Promise<AuthSession> | null = null;

  function notify(next: AuthSession | null) {
    session = next;
    if (next === null) storage.removeItem(storageKey);
    else storage.setItem(storageKey, JSON.stringify(next));
    listeners.forEach((listener) => listener(next));
  }

  async function token(
    grantType: 'password' | 'refresh_token',
    body: Record<string, string>,
  ): Promise<AuthSession> {
    const response = await request(
      `${options.url.replace(/\/$/, '')}/auth/v1/token?grant_type=${grantType}`,
      {
        method: 'POST',
        headers: {
          apikey: options.publishableKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) throw new AuthenticationError('認証できませんでした。');
    const next = parseSession(
      (await response.json()) as SupabaseSessionResponse,
      now(),
    );
    notify(next);
    return next;
  }

  async function refresh(current: AuthSession): Promise<AuthSession> {
    refreshPromise ??= token('refresh_token', {
      refresh_token: current.refreshToken,
    }).finally(() => {
      refreshPromise = null;
    });
    try {
      return await refreshPromise;
    } catch (error) {
      notify(null);
      throw error;
    }
  }

  return {
    async getSession() {
      if (session === null) return null;
      if (session.expiresAt - Math.floor(now() / 1000) > refreshMarginSeconds)
        return session;
      return refresh(session);
    },
    signIn(email, password) {
      return token('password', { email, password });
    },
    async signOut() {
      const accessToken = session?.accessToken;
      notify(null);
      if (accessToken === undefined) return;
      await request(`${options.url.replace(/\/$/, '')}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: options.publishableKey,
          authorization: `Bearer ${accessToken}`,
        },
      }).catch(() => undefined);
    },
    onSessionChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createBrowserAuthService(): AuthService {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
  if (!url || !publishableKey)
    throw new Error('Supabase Authの環境変数が設定されていません。');
  return createSupabaseAuthService({ url, publishableKey });
}

function readSession(storage: Storage): AuthSession | null {
  try {
    const value = storage.getItem(storageKey);
    if (value === null) return null;
    const parsed = JSON.parse(value) as AuthSession;
    if (
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.refreshToken !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      typeof parsed.user?.id !== 'string' ||
      typeof parsed.user.email !== 'string'
    )
      throw new Error('invalid session');
    return parsed;
  } catch {
    storage.removeItem(storageKey);
    return null;
  }
}

function parseSession(body: SupabaseSessionResponse, now: number): AuthSession {
  if (
    typeof body.access_token !== 'string' ||
    typeof body.refresh_token !== 'string' ||
    typeof body.user?.id !== 'string'
  )
    throw new AuthenticationError('認証セッションを取得できませんでした。');
  const expiresAt =
    typeof body.expires_at === 'number'
      ? body.expires_at
      : Math.floor(now / 1000) +
        (typeof body.expires_in === 'number' ? body.expires_in : 3600);
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt,
    user: {
      id: body.user.id,
      email: typeof body.user.email === 'string' ? body.user.email : '',
    },
  };
}
