import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectsApi } from '../api/client.js';
import type {
  Company,
  CompanyContact,
  Engineer,
  Project,
} from '../api/generated.js';
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

const company: Company = {
  id: '22222222-2222-4222-8222-222222222222',
  managementNo: 'CO-000001',
  legalName: '青波株式会社',
  displayName: '青波',
  corporateNumber: '1234567890123',
  postalCode: '100-0001',
  prefecture: '東京都',
  city: '千代田区',
  addressLine: '千代田1-1',
  websiteUrl: 'https://example.com',
  representativeName: '青波 太郎',
  status: 'active',
  updatedAt: '2026-08-09T00:00:00Z',
  rowVersion: 1,
};
const contact: CompanyContact = {
  id: '33333333-3333-4333-8333-333333333333',
  companyId: company.id,
  managementNo: 'CT-000001',
  familyName: '青波',
  givenName: '太郎',
  departmentName: '営業部',
  positionTitle: '部長',
  email: 'taro@example.com',
  phone: null,
  mobilePhone: null,
  isPrimary: true,
  status: 'active',
  updatedAt: '2026-08-09T00:00:00Z',
  rowVersion: 2,
};
const engineer: Engineer = {
  id: '55555555-5555-4555-8555-555555555555',
  managementNo: 'EN-000001',
  familyName: '青波',
  givenName: '太郎',
  displayName: '青波 太郎',
  status: 'active',
  availabilityStatus: 'available',
  availableFrom: '2026-09-01',
  nearestStation: '東京',
  summary: 'TypeScriptエンジニア',
  updatedAt: '2026-08-09T00:00:00Z',
  rowVersion: 1,
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
    listCompanies: vi.fn(() =>
      Promise.resolve({ items: [], page: { limit: 50, nextCursor: null } }),
    ),
    getCompany: vi.fn(() => Promise.reject(new Error('not configured'))),
    createCompany: vi.fn(() => Promise.resolve(company)),
    updateCompany: vi.fn(() => Promise.resolve(company)),
    deleteCompany: vi.fn(() => Promise.resolve()),
    listCompanyAudit: vi.fn(() => Promise.resolve({ items: [] })),
    listCompanyContacts: vi.fn(() =>
      Promise.resolve({ items: [], page: { limit: 50, nextCursor: null } }),
    ),
    getCompanyContact: vi.fn(() => Promise.reject(new Error('not configured'))),
    createCompanyContact: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    updateCompanyContact: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    deleteCompanyContact: vi.fn(() => Promise.resolve()),
    listCompanyContactAudit: vi.fn(() => Promise.resolve({ items: [] })),
    listEngineers: vi.fn(() =>
      Promise.resolve({ items: [], page: { limit: 50, nextCursor: null } }),
    ),
    getEngineer: vi.fn(() => Promise.reject(new Error('not configured'))),
    createEngineer: vi.fn(() => Promise.resolve(engineer)),
    updateEngineer: vi.fn(() => Promise.resolve(engineer)),
    deleteEngineer: vi.fn(() => Promise.resolve()),
    listEngineerAudit: vi.fn(() => Promise.resolve({ items: [] })),
    getEngineerPrivate: vi.fn(() =>
      Promise.resolve({
        engineerId: engineer.id,
        birthDate: null,
        gender: null,
        personalEmail: null,
        phone: null,
        postalCode: null,
        prefecture: null,
        city: null,
        addressLine: null,
        emergencyContact: null,
        notes: null,
        updatedAt: '2026-08-09T00:00:00Z',
        rowVersion: 1,
      }),
    ),
    updateEngineerPrivate: vi.fn(),
    listEngineerAffiliations: vi.fn(() => Promise.resolve({ items: [] })),
    saveEngineerAffiliation: vi.fn(),
    listEngineerPreferences: vi.fn(() => Promise.resolve({ items: [] })),
    saveEngineerPreference: vi.fn(),
    listEngineerSkills: vi.fn(() => Promise.resolve({ items: [] })),
    saveEngineerSkill: vi.fn(),
    listEngineerQualifications: vi.fn(() => Promise.resolve({ items: [] })),
    saveEngineerQualification: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => window.history.replaceState({}, '', '/projects'));
afterEach(cleanup);

describe('App', () => {
  it('renders the engineer list and opens public detail', async () => {
    window.history.replaceState({}, '', '/engineers');
    render(
      <App
        auth={auth()}
        api={api({
          listEngineers: () =>
            Promise.resolve({
              items: [engineer],
              page: { limit: 50, nextCursor: null },
            }),
          getEngineer: () => Promise.resolve(engineer),
        })}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'EN-000001' }));
    expect(await screen.findByText('TypeScriptエンジニア')).toBeInTheDocument();
  });
  it('creates an engineer from the engineer list', async () => {
    const createEngineer = vi.fn(() => Promise.resolve(engineer));
    window.history.replaceState({}, '', '/engineers');
    render(<App auth={auth()} api={api({ createEngineer })} />);
    fireEvent.click(
      await screen.findByRole('button', { name: '技術者を登録' }),
    );
    expect(
      await screen.findByRole('heading', { name: '技術者登録' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('管理番号'), {
      target: { value: 'EN-000001' },
    });
    fireEvent.change(screen.getByLabelText('姓'), {
      target: { value: '青波' },
    });
    fireEvent.change(screen.getByLabelText('名'), {
      target: { value: '太郎' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(createEngineer).toHaveBeenCalledWith(
        expect.objectContaining({
          managementNo: 'EN-000001',
          familyName: '青波',
          givenName: '太郎',
          status: 'candidate',
          availabilityStatus: 'unknown',
        }),
      ),
    );
  });
  it('soft-deletes an engineer and shows its audit trail', async () => {
    window.history.replaceState({}, '', `/engineers/${engineer.id}`);
    const deleteEngineer = vi.fn(() => Promise.resolve());
    const listEngineerAudit = vi.fn(() =>
      Promise.resolve({
        items: [
          {
            id: '66666666-6666-4666-8666-666666666666',
            occurredAt: '2026-08-09T07:00:00Z',
            actorUserId: null,
            action: 'engineer.updated',
            requestId: null,
          },
        ],
      }),
    );
    render(
      <App
        auth={auth()}
        api={api({
          getEngineer: () => Promise.resolve(engineer),
          deleteEngineer,
          listEngineerAudit,
        })}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: '監査履歴' }));
    expect(await screen.findByText('engineer.updated')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    fireEvent.change(screen.getByLabelText('削除理由'), {
      target: { value: '重複登録のため' },
    });
    fireEvent.click(screen.getByRole('button', { name: '論理削除する' }));
    await waitFor(() =>
      expect(deleteEngineer).toHaveBeenCalledWith(
        engineer.id,
        engineer.rowVersion,
        '重複登録のため',
      ),
    );
  });
  it('loads and updates engineer private details with their own row version', async () => {
    window.history.replaceState({}, '', `/engineers/${engineer.id}`);
    const detail = {
      engineerId: engineer.id,
      birthDate: null,
      gender: null,
      personalEmail: 'engineer@example.com',
      phone: null,
      postalCode: null,
      prefecture: null,
      city: null,
      addressLine: null,
      emergencyContact: null,
      notes: null,
      updatedAt: '2026-08-09T00:00:00Z',
      rowVersion: 4,
    };
    const updateEngineerPrivate = vi.fn(() =>
      Promise.resolve({ ...detail, phone: '090-0000-0000', rowVersion: 5 }),
    );
    render(
      <App
        auth={auth()}
        api={api({
          getEngineer: () => Promise.resolve(engineer),
          getEngineerPrivate: () => Promise.resolve(detail),
          updateEngineerPrivate,
        })}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: '機密個人情報' }),
    );
    expect(
      await screen.findByDisplayValue('engineer@example.com'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('電話'), {
      target: { value: '090-0000-0000' },
    });
    fireEvent.click(screen.getByRole('button', { name: '機密個人情報を保存' }));
    await waitFor(() =>
      expect(updateEngineerPrivate).toHaveBeenCalledWith(
        engineer.id,
        4,
        expect.objectContaining({ phone: '090-0000-0000' }),
      ),
    );
  });
  it('navigates to the company list and detail', async () => {
    const getCompany = vi.fn(() => Promise.resolve(company));
    render(
      <App
        auth={auth()}
        api={api({
          listCompanies: () =>
            Promise.resolve({
              items: [company],
              page: { limit: 50, nextCursor: null },
            }),
          getCompany,
        })}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: '会社' }));
    expect(
      await screen.findByRole('heading', { name: '会社一覧' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'CO-000001' }));
    expect(
      await screen.findByRole('heading', { name: '青波' }),
    ).toBeInTheDocument();
    expect(screen.getByText('青波株式会社')).toBeInTheDocument();
    expect(getCompany).toHaveBeenCalledWith(company.id);
  });

  it('creates a company from the company list', async () => {
    const createCompany = vi.fn(() => Promise.resolve(company));
    render(<App auth={auth()} api={api({ createCompany })} />);
    fireEvent.click(await screen.findByRole('button', { name: '会社' }));
    fireEvent.click(await screen.findByRole('button', { name: '会社を登録' }));
    expect(
      await screen.findByRole('heading', { name: '会社登録' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('管理番号'), {
      target: { value: 'CO-000001' },
    });
    fireEvent.change(screen.getByLabelText('正式名称'), {
      target: { value: '青波株式会社' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(createCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        managementNo: 'CO-000001',
        legalName: '青波株式会社',
        status: 'prospect',
      }),
    );
  });

  it('loads and updates a company with its row version', async () => {
    window.history.replaceState({}, '', `/companies/${company.id}/edit`);
    const updateCompany = vi.fn(() => Promise.resolve(company));
    render(
      <App
        auth={auth()}
        api={api({ getCompany: () => Promise.resolve(company), updateCompany })}
      />,
    );
    expect(await screen.findByDisplayValue('青波株式会社')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(updateCompany).toHaveBeenCalledWith(
      company.id,
      company.rowVersion,
      expect.objectContaining({ legalName: '青波株式会社' }),
    );
  });
  it('soft-deletes a company with a required reason', async () => {
    window.history.replaceState({}, '', `/companies/${company.id}`);
    const deleteCompany = vi.fn(() => Promise.resolve());
    render(
      <App
        auth={auth()}
        api={api({ getCompany: () => Promise.resolve(company), deleteCompany })}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: '削除' }));
    fireEvent.change(screen.getByLabelText('削除理由'), {
      target: { value: '重複登録のため' },
    });
    fireEvent.click(screen.getByRole('button', { name: '論理削除する' }));
    await waitFor(() =>
      expect(deleteCompany).toHaveBeenCalledWith(
        company.id,
        company.rowVersion,
        '重複登録のため',
      ),
    );
  });
  it('soft-deletes a company contact and shows its audit trail', async () => {
    window.history.replaceState({}, '', `/contacts/${contact.id}`);
    const deleteCompanyContact = vi.fn(() => Promise.resolve());
    const listCompanyContactAudit = vi.fn(() =>
      Promise.resolve({
        items: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            occurredAt: '2026-08-09T06:00:00Z',
            actorUserId: null,
            action: 'company_contact.updated',
            requestId: null,
          },
        ],
      }),
    );
    render(
      <App
        auth={auth()}
        api={api({
          getCompanyContact: () => Promise.resolve(contact),
          deleteCompanyContact,
          listCompanyContactAudit,
        })}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: '監査履歴' }));
    expect(
      await screen.findByText('company_contact.updated'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    fireEvent.change(screen.getByLabelText('削除理由'), {
      target: { value: '退職のため' },
    });
    fireEvent.click(screen.getByRole('button', { name: '論理削除する' }));
    await waitFor(() =>
      expect(deleteCompanyContact).toHaveBeenCalledWith(
        contact.id,
        contact.rowVersion,
        '退職のため',
      ),
    );
  });
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
