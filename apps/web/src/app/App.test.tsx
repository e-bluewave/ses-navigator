import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectsApi } from '../api/client.js';
import type { Project } from '../api/generated.js';
import type { AuthService, AuthSession } from '../auth/auth-client.js';
import { App } from './App.js';

const project: Project = {
  id: '11111111-1111-4111-8111-111111111111',
  managementNo: 'PJ-000001',
  projectName: '基幹システム刷新',
  summary: '基幹業務を刷新する案件です。',
  projectStatus: 'open',
  recruitmentStatus: 'recruiting',
  plannedStartOn: '2026-09-01',
  plannedEndOn: null,
  updatedAt: '2026-08-08T12:00:00Z',
  rowVersion: 2,
};

const session: AuthSession = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: 9_999_999_999,
  user: { id: 'user-1', email: 'user@example.com' },
};

function auth(current: AuthSession | null = session): AuthService {
  return {
    getSession: vi.fn(() => Promise.resolve(current)),
    signIn: vi.fn(() => Promise.resolve(session)),
    signOut: vi.fn(() => Promise.resolve()),
    onSessionChange: vi.fn(() => () => undefined),
  };
}

function api(overrides: Partial<ProjectsApi> = {}): ProjectsApi {
  return {
    listProjects: vi.fn(() =>
      Promise.resolve({
        items: [project],
        page: { limit: 50, nextCursor: null },
      }),
    ),
    getProject: vi.fn(() => Promise.resolve(project)),
    ...overrides,
  };
}

beforeEach(() => window.history.replaceState({}, '', '/projects'));
afterEach(cleanup);

describe('App', () => {
  it('renders projects returned by the generated client', async () => {
    render(<App auth={auth()} api={api()} />);
    expect(
      await screen.findByRole('heading', { name: '案件一覧' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: '基幹システム刷新' }),
    ).toBeInTheDocument();
    expect(screen.getByText('PJ-000001')).toBeInTheDocument();
    expect(screen.getByText('募集中')).toBeInTheDocument();
  });

  it('navigates from the list to project detail', async () => {
    const getProject = vi.fn(() => Promise.resolve(project));
    const projects = api({ getProject });
    render(<App auth={auth()} api={projects} />);
    fireEvent.click(
      await screen.findByRole('button', { name: '基幹システム刷新' }),
    );
    expect(
      await screen.findByRole('heading', { name: '基幹システム刷新' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('基幹業務を刷新する案件です。'),
    ).toBeInTheDocument();
    expect(getProject).toHaveBeenCalledWith(project.id);
  });

  it('renders an empty state', async () => {
    render(
      <App
        auth={auth()}
        api={api({
          listProjects: () =>
            Promise.resolve({
              items: [],
              page: { limit: 50, nextCursor: null },
            }),
        })}
      />,
    );
    expect(
      await screen.findByText('表示できる案件はありません。'),
    ).toBeInTheDocument();
  });

  it('shows login for an unauthenticated user and signs in', async () => {
    const authentication = auth(null);
    render(<App auth={authentication} api={api()} />);
    expect(
      await screen.findByRole('heading', { name: 'SES Navigator' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));
    expect(authentication.signIn).toHaveBeenCalledWith(
      'user@example.com',
      'password',
    );
  });

  it('logs out from an authenticated session', async () => {
    const authentication = auth();
    render(<App auth={authentication} api={api()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'ログアウト' }));
    expect(authentication.signOut).toHaveBeenCalledOnce();
  });
});
