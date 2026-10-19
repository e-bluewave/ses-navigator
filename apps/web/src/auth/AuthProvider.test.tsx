import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from './AuthProvider.js';
import type { AuthService, AuthSession } from './auth-client.js';

const session: AuthSession = {
  accessToken: 'fixture-access',
  refreshToken: 'fixture-refresh',
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'fixture-user', email: 'user@example.test' },
  assuranceLevel: 'aal1',
  factors: [],
};

function deferredSession() {
  let resolve!: (value: AuthSession | null) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<AuthSession | null>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function fixtureAuth(getSession: AuthService['getSession']) {
  let listener: (next: AuthSession | null) => void = () => undefined;
  const auth: AuthService = {
    getSession,
    signIn: vi.fn().mockResolvedValue(session),
    signOut: vi.fn().mockResolvedValue(undefined),
    enrollMfa: vi.fn(),
    verifyMfa: vi.fn(),
    requestPasswordReset: vi.fn(),
    consumeAuthCallback: vi.fn(),
    updatePassword: vi.fn(),
    onSessionChange(next) {
      listener = next;
      return () => undefined;
    },
  };
  return { auth, change: (next: AuthSession | null) => listener(next) };
}

function State() {
  const auth = useAuth();
  return (
    <>
      <p>
        {auth.loading ? 'loading' : (auth.session?.user.id ?? 'signed-out')}
      </p>
      {auth.error ? <p role="alert">{auth.error}</p> : null}
      <button onClick={() => void auth.signOut()}>sign out</button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AuthProvider session lifecycle', () => {
  it('does not show an old refresh error after a different session arrives', async () => {
    const refresh = deferredSession();
    const getSession = vi
      .fn<AuthService['getSession']>()
      .mockResolvedValueOnce({ ...session, expiresAt: 0 })
      .mockReturnValueOnce(refresh.promise);
    const fixture = fixtureAuth(getSession);
    render(
      <AuthProvider auth={fixture.auth}>
        <State />
      </AuthProvider>,
    );
    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(2));
    act(() =>
      fixture.change({
        ...session,
        user: { id: 'new-user', email: 'new@example.test' },
      }),
    );
    await act(async () => {
      refresh.reject(new Error('old refresh failed'));
      await Promise.resolve();
    });
    expect(screen.getByText('new-user')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('ignores a stale initial read after a session-change notification', async () => {
    const initial = deferredSession();
    const fixture = fixtureAuth(() => initial.promise);
    render(
      <AuthProvider auth={fixture.auth}>
        <State />
      </AuthProvider>,
    );
    act(() => fixture.change(null));
    await act(async () => {
      initial.resolve(session);
      await Promise.resolve();
    });
    expect(screen.getByText('signed-out')).toBeInTheDocument();
    expect(screen.queryByText('fixture-user')).not.toBeInTheDocument();
  });

  it('ignores a stale scheduled refresh after logout without requiring service notifications', async () => {
    vi.useFakeTimers();
    const refresh = deferredSession();
    const getSession = vi
      .fn<AuthService['getSession']>()
      .mockResolvedValueOnce({
        ...session,
        expiresAt: Math.floor(Date.now() / 1000) + 61,
      })
      .mockReturnValueOnce(refresh.promise);
    const fixture = fixtureAuth(getSession);
    render(
      <AuthProvider auth={fixture.auth}>
        <State />
      </AuthProvider>,
    );
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(1100));
    expect(getSession).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'sign out' }));
    await act(async () => {
      refresh.resolve(session);
      await Promise.resolve();
    });
    expect(screen.getByText('signed-out')).toBeInTheDocument();
    expect(screen.queryByText('fixture-user')).not.toBeInTheDocument();
  });

  it('clears the session when a scheduled refresh fails without a notification', async () => {
    const refresh = deferredSession();
    const getSession = vi
      .fn<AuthService['getSession']>()
      .mockResolvedValueOnce({ ...session, expiresAt: 0 })
      .mockImplementationOnce(() =>
        refresh.promise.then(() => {
          throw new Error('fixture refresh failed');
        }),
      );
    const fixture = fixtureAuth(getSession);
    render(
      <AuthProvider auth={fixture.auth}>
        <State />
      </AuthProvider>,
    );
    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(2));
    await act(async () => {
      refresh.resolve(null);
      await Promise.resolve();
    });
    expect(screen.getByText('signed-out')).toBeInTheDocument();
  });
});
