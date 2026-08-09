import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import type { AuthService, AuthSession } from './auth-client.js';

type AuthState = {
  loading: boolean;
  session: AuthSession | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({
  auth,
  children,
}: {
  auth: AuthService;
  children: ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = auth.onSessionChange((next) => {
      if (active) setSession(next);
    });
    auth
      .getSession()
      .then((next) => active && setSession(next))
      .catch(() => active && setError('セッションの有効期限が切れました。'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth]);

  useEffect(() => {
    if (session === null) return;
    const refreshInMs = Math.max(
      0,
      Math.min(session.expiresAt * 1000 - Date.now() - 60_000, 2_147_000_000),
    );
    const timer = window.setTimeout(() => {
      auth
        .getSession()
        .then(setSession)
        .catch(() => setError('セッションの有効期限が切れました。'));
    }, refreshInMs);
    return () => window.clearTimeout(timer);
  }, [auth, session]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        setSession(await auth.signIn(email, password));
      } catch {
        setError('メールアドレスまたはパスワードを確認してください。');
      }
    },
    [auth],
  );
  const signOut = useCallback(async () => {
    setError(null);
    await auth.signOut();
    setSession(null);
  }, [auth]);

  const value = useMemo(
    () => ({ loading, session, error, signIn, signOut }),
    [loading, session, error, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (state === null) throw new Error('AuthProvider is required');
  return state;
}
