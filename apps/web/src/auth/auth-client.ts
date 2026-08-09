export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email: string };
  assuranceLevel: 'aal1' | 'aal2';
  factors: Array<{ id: string; status: 'verified' | 'unverified' }>;
}

export interface MfaEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

export interface AuthService {
  getSession: () => Promise<AuthSession | null>;
  signIn: (email: string, password: string) => Promise<AuthSession>;
  signOut: () => Promise<void>;
  enrollMfa: () => Promise<MfaEnrollment>;
  verifyMfa: (factorId: string, code: string) => Promise<AuthSession>;
  onSessionChange: (
    listener: (session: AuthSession | null) => void,
  ) => () => void;
}

type SupabaseSessionResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  expires_at?: unknown;
  user?: { id?: unknown; email?: unknown; factors?: unknown };
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
  let enrollPromise: Promise<MfaEnrollment> | null = null;

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
    async enrollMfa() {
      if (session === null) throw new AuthenticationError('認証が必要です。');
      enrollPromise ??= request(
        `${options.url.replace(/\/$/, '')}/auth/v1/factors`,
        {
          method: 'POST',
          headers: {
            apikey: options.publishableKey,
            authorization: `Bearer ${session.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            factor_type: 'totp',
            friendly_name: 'SES Navigator',
          }),
        },
      )
        .then(async (response) => {
          if (!response.ok)
            throw new AuthenticationError('MFAを登録できませんでした。');
          const body = (await response.json()) as {
            id?: unknown;
            totp?: { qr_code?: unknown; secret?: unknown };
          };
          if (
            typeof body.id !== 'string' ||
            typeof body.totp?.qr_code !== 'string' ||
            typeof body.totp.secret !== 'string'
          )
            throw new AuthenticationError(
              'MFA登録情報を取得できませんでした。',
            );
          return {
            factorId: body.id,
            qrCode: body.totp.qr_code,
            secret: body.totp.secret,
          };
        })
        .finally(() => {
          enrollPromise = null;
        });
      return enrollPromise;
    },
    async verifyMfa(factorId, code) {
      if (session === null) throw new AuthenticationError('認証が必要です。');
      const base = options.url.replace(/\/$/, '');
      const headers = {
        apikey: options.publishableKey,
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
      };
      const challenge = await request(
        `${base}/auth/v1/factors/${encodeURIComponent(factorId)}/challenge`,
        { method: 'POST', headers, body: '{}' },
      );
      const challengeBody = (await challenge.json()) as { id?: unknown };
      if (!challenge.ok || typeof challengeBody.id !== 'string')
        throw new AuthenticationError('MFAを確認できませんでした。');
      const verified = await request(
        `${base}/auth/v1/factors/${encodeURIComponent(factorId)}/verify`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ challenge_id: challengeBody.id, code }),
        },
      );
      if (!verified.ok)
        throw new AuthenticationError('確認コードが正しくありません。');
      const next = parseSession(
        (await verified.json()) as SupabaseSessionResponse,
        now(),
      );
      notify(next);
      return next;
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
    return {
      ...parsed,
      assuranceLevel:
        parsed.assuranceLevel === 'aal2' ? 'aal2' : readAal(parsed.accessToken),
      factors: Array.isArray(parsed.factors) ? parsed.factors : [],
    };
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
    assuranceLevel: readAal(body.access_token),
    factors: Array.isArray(body.user.factors)
      ? body.user.factors.flatMap((factor) => {
          if (typeof factor !== 'object' || factor === null) return [];
          const value = factor as { id?: unknown; status?: unknown };
          return typeof value.id === 'string' &&
            (value.status === 'verified' || value.status === 'unverified')
            ? [{ id: value.id, status: value.status }]
            : [];
        })
      : [],
  };
}

function readAal(token: string): 'aal1' | 'aal2' {
  try {
    const payload = token.split('.')[1];
    if (payload === undefined) return 'aal1';
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { aal?: unknown };
    return decoded.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch {
    return 'aal1';
  }
}
