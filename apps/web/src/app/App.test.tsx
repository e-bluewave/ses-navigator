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
  assuranceLevel: 'aal1',
  factors: [],
};

function auth(current: AuthSession | null = session): AuthService {
  return {
    getSession: vi.fn(() => Promise.resolve(current)),
    signIn: vi.fn(() => Promise.resolve(session)),
    signOut: vi.fn(() => Promise.resolve()),
    enrollMfa: vi.fn(() =>
      Promise.resolve({
        factorId: 'factor-1',
        qrCode: 'data:image/svg+xml,mfa',
        secret: 'SECRET',
      }),
    ),
    verifyMfa: vi.fn(() =>
      Promise.resolve({ ...session, assuranceLevel: 'aal2' as const }),
    ),
    requestPasswordReset: vi.fn(() => Promise.resolve()),
    consumeAuthCallback: vi.fn(() => Promise.resolve(null)),
    updatePassword: vi.fn(() => Promise.resolve()),
    onSessionChange: vi.fn(() => () => undefined),
  };
}

function api(overrides: Partial<ProjectsApi> = {}): ProjectsApi {
  return {
    getAuthContext: vi.fn(() => Promise.resolve({ requiresMfa: false })),
    listProjects: vi.fn(() =>
      Promise.resolve({
        items: [project],
        page: { limit: 50, nextCursor: null },
      }),
    ),
    getProject: vi.fn(() => Promise.resolve(project)),
    createProject: vi.fn(() => Promise.resolve(project)),
    updateProject: vi.fn(() => Promise.resolve(project)),
    deleteProject: vi.fn(() => Promise.resolve()),
    listProjectAudit: vi.fn(() => Promise.resolve({ items: [] })),
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
    expect(screen.getAllByText('募集中')).toHaveLength(2);
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

  it('soft-deletes a project with a required reason', async () => {
    window.history.replaceState({}, '', `/projects/${project.id}`);
    const deleteProject = vi.fn(() => Promise.resolve());
    render(<App auth={auth()} api={api({ deleteProject })} />);
    fireEvent.click(await screen.findByRole('button', { name: '削除' }));
    fireEvent.change(screen.getByLabelText('削除理由'), {
      target: { value: '重複登録のため' },
    });
    fireEvent.click(screen.getByRole('button', { name: '論理削除する' }));
    expect(deleteProject).toHaveBeenCalledWith(project.id, 2, '重複登録のため');
    expect(
      await screen.findByRole('heading', { name: '案件一覧' }),
    ).toBeInTheDocument();
  });

  it('shows project audit history', async () => {
    window.history.replaceState({}, '', `/projects/${project.id}`);
    const listProjectAudit = vi.fn(() =>
      Promise.resolve({
        items: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            occurredAt: '2026-08-09T04:00:00Z',
            actorUserId: null,
            action: 'project.updated',
            requestId: null,
          },
        ],
      }),
    );
    render(<App auth={auth()} api={api({ listProjectAudit })} />);
    fireEvent.click(await screen.findByRole('button', { name: '監査履歴' }));
    expect(await screen.findByText('project.updated')).toBeInTheDocument();
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

  it('searches, filters, and loads the next cursor page', async () => {
    const listProjects = vi
      .fn()
      .mockResolvedValueOnce({
        items: [project],
        page: { limit: 50, nextCursor: null },
      })
      .mockResolvedValueOnce({
        items: [project],
        page: { limit: 50, nextCursor: 'cursor-2' },
      })
      .mockResolvedValueOnce({
        items: [
          {
            ...project,
            id: '22222222-2222-4222-8222-222222222222',
            managementNo: 'PJ-000002',
          },
        ],
        page: { limit: 50, nextCursor: null },
      });
    render(<App auth={auth()} api={api({ listProjects })} />);
    await screen.findByText('PJ-000001');
    fireEvent.change(screen.getByLabelText('案件検索'), {
      target: { value: '基幹' },
    });
    fireEvent.change(screen.getByLabelText('案件状態'), {
      target: { value: 'open' },
    });
    fireEvent.change(screen.getByLabelText('募集状態'), {
      target: { value: 'recruiting' },
    });
    fireEvent.click(screen.getByRole('button', { name: '検索' }));
    await screen.findByRole('button', { name: 'さらに表示' });
    fireEvent.click(screen.getByRole('button', { name: 'さらに表示' }));
    expect(await screen.findByText('PJ-000002')).toBeInTheDocument();
    expect(listProjects).toHaveBeenLastCalledWith({
      limit: 50,
      cursor: 'cursor-2',
      q: '基幹',
      status: 'open',
      recruitmentStatus: 'recruiting',
    });
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

  it('blocks an administrator at AAL1 and shows the MFA flow', async () => {
    render(
      <App
        auth={auth()}
        api={api({
          getAuthContext: () => Promise.resolve({ requiresMfa: true }),
        })}
      />,
    );
    expect(
      await screen.findByRole('heading', { name: '多要素認証' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('案件一覧')).not.toBeInTheDocument();
  });
});
