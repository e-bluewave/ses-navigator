import {
  act,
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
  Interview,
  InterviewInput,
  Proposal,
  Project,
  Contract,
  ContractInput,
  Engagement,
  EngagementInput,
  WorkLog,
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

const proposal: Proposal = {
  id: '66666666-6666-4666-8666-666666666666',
  managementNo: 'PR-000001',
  projectPositionId: '11111111-1111-4111-8111-111111111111',
  engineerId: '55555555-5555-4555-8555-555555555555',
  destinationCompanyId: '22222222-2222-4222-8222-222222222222',
  destinationContactId: null,
  resumeVersionId: null,
  requirementVersionId: null,
  proposedUnitPrice: 800000,
  currencyCode: 'JPY',
  status: 'sent',
  proposedStartDate: '2026-09-01',
  validityDate: '2026-08-31',
  updatedAt: '2026-08-11T00:00:00Z',
  rowVersion: 1,
};

const interview: Interview = {
  id: '77777777-7777-4777-8777-777777777777',
  proposalId: proposal.id,
  proposalManagementNo: proposal.managementNo,
  projectPositionId: proposal.projectPositionId,
  engineerId: proposal.engineerId,
  interviewRound: 1,
  interviewType: 'online',
  status: 'scheduled',
  scheduledStartAt: '2026-08-20T01:00:00Z',
  scheduledEndAt: '2026-08-20T02:00:00Z',
  locationText: null,
  meetingUrl: 'https://meet.example.com/interview',
  notes: '経歴書を確認する',
  scheduleCandidates: [
    {
      id: '88888888-8888-4888-8888-888888888888',
      startAt: '2026-08-19T01:00:00Z',
      endAt: '2026-08-19T02:00:00Z',
      candidateOrder: 1,
    },
  ],
  participants: [],
  feedback: [],
  outcome: null,
  statusHistory: [],
  updatedAt: '2026-08-11T00:00:00Z',
  rowVersion: 1,
};

const contract: Contract = {
  id: '99999999-9999-4999-8999-999999999999',
  contractNo: 'CN-000001',
  projectId: project.id,
  proposalId: proposal.id,
  engineerId: proposal.engineerId,
  contractType: 'ses',
  status: 'active',
  title: '基幹システム刷新 SES契約',
  startDate: '2026-09-01',
  endDate: '2027-02-28',
  autoRenew: true,
  currency: 'JPY',
  monthlyAmount: 900000,
  hourlyAmount: null,
  settlementLowerHours: 140,
  settlementUpperHours: 180,
  paymentTerms: '月末締め翌月末払い',
  notes: '更新確認は終了日の30日前',
  parties: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      companyId: '22222222-2222-4222-8222-222222222222',
      contactId: null,
      partyRole: 'customer',
      billingRole: 'bill_to',
      isPrimary: true,
    },
  ],
  versions: [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      versionNo: 1,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
      changeSummary: '初版',
      approvedAt: '2026-08-12T00:00:00Z',
      createdAt: '2026-08-12T00:00:00Z',
    },
  ],
  workLogs: [],
  approval: null,
  updatedAt: '2026-08-12T00:00:00Z',
  rowVersion: 1,
};

const engagement: Engagement = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  engagementNo: 'ENG-000001',
  contractId: contract.id,
  proposalId: proposal.id,
  engineerId: proposal.engineerId,
  engineerName: '青波 太郎',
  contractTitle: contract.title,
  status: 'active',
  plannedStartDate: '2026-09-01',
  plannedEndDate: '2027-02-28',
  actualStartDate: '2026-09-01',
  actualEndDate: null,
  roleName: 'バックエンドエンジニア',
  workLocation: '東京都',
  remoteFrequency: '週3日',
  updatedAt: '2026-09-01T00:00:00Z',
  rowVersion: 2,
  previousEngagementId: null,
  conditions: [
    {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      versionNo: 1,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
      monthlySalesAmount: 900000,
      monthlyCostAmount: 650000,
      currency: 'JPY',
      settlementLowerHours: 140,
      settlementUpperHours: 180,
      workLocation: '東京都',
      remoteFrequency: '週3日',
      notes: '初回条件',
      createdAt: '2026-08-14T00:00:00Z',
    },
  ],
  statusHistories: [
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      fromStatus: 'preparing',
      toStatus: 'active',
      changeReason: '参画開始',
      changedAt: '2026-09-01T00:00:00Z',
    },
  ],
};

const workLog: WorkLog = {
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  contractId: contract.id,
  engineerId: proposal.engineerId,
  contractTitle: contract.title,
  engineerName: '青波 太郎',
  workMonth: '2026-08-01',
  status: 'approved',
  scheduledDays: 20,
  actualDays: 19,
  scheduledHours: 160,
  actualHours: 156,
  overtimeHours: 8,
  absenceHours: 8,
  customerApprovedAt: '2026-09-03T00:00:00Z',
  updatedAt: '2026-09-03T01:00:00Z',
  rowVersion: 3,
  approvedByName: '顧客担当者',
  notes: '承認済み',
  details: [
    {
      id: '12121212-1212-4212-8212-121212121212',
      workDate: '2026-08-03',
      workType: 'work',
      startTime: '09:00:00',
      endTime: '18:00:00',
      breakMinutes: 60,
      workHours: 8,
      overtimeHours: 0,
      description: '設計・実装',
      updatedAt: '2026-08-03T10:00:00Z',
      rowVersion: 1,
    },
  ],
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
    listWorkLogs: vi.fn(() =>
      Promise.resolve({ items: [], page: { limit: 50, nextCursor: null } }),
    ),
    getWorkLog: vi.fn(() => Promise.reject(new Error('not configured'))),
    listEngagements: vi.fn(() =>
      Promise.resolve({ items: [], page: { limit: 50, nextCursor: null } }),
    ),
    getEngagement: vi.fn(() => Promise.reject(new Error('not configured'))),
    createEngagement: vi.fn(() => Promise.reject(new Error('not configured'))),
    updateEngagement: vi.fn(() => Promise.reject(new Error('not configured'))),
    transitionEngagementStatus: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    listContracts: vi.fn(() =>
      Promise.resolve({ items: [], page: { limit: 50, nextCursor: null } }),
    ),
    getContract: vi.fn(() => Promise.reject(new Error('not configured'))),
    createContract: vi.fn(() => Promise.reject(new Error('not configured'))),
    updateContract: vi.fn(() => Promise.reject(new Error('not configured'))),
    transitionContractStatus: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    listInterviews: vi.fn(() =>
      Promise.resolve({ items: [], page: { limit: 50, nextCursor: null } }),
    ),
    getInterview: vi.fn(() => Promise.reject(new Error('not configured'))),
    createInterview: vi.fn(() => Promise.reject(new Error('not configured'))),
    updateInterview: vi.fn(() => Promise.reject(new Error('not configured'))),
    saveInterviewResult: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    listProposals: vi.fn(() =>
      Promise.resolve({ items: [], page: { limit: 50, nextCursor: null } }),
    ),
    getProposal: vi.fn(() => Promise.reject(new Error('not configured'))),
    createProposal: vi.fn(() => Promise.reject(new Error('not configured'))),
    updateProposal: vi.fn(() => Promise.reject(new Error('not configured'))),
    transitionProposalStatus: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    winProposal: vi.fn(() => Promise.reject(new Error('not configured'))),
    listEngineerCareerHistories: vi.fn(() => Promise.resolve({ items: [] })),
    saveEngineerCareerHistory: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    listEngineerResumes: vi.fn(() => Promise.resolve({ items: [] })),
    addEngineerResumeVersion: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
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
  it('lists monthly work logs and opens daily detail', async () => {
    window.history.replaceState({}, '', '/work-logs');
    const client = api({
      listWorkLogs: vi.fn(() =>
        Promise.resolve({
          items: [workLog],
          page: { limit: 50, nextCursor: null },
        }),
      ),
      getWorkLog: vi.fn(() => Promise.resolve(workLog)),
    });
    render(<App auth={auth()} api={client} />);
    fireEvent.click(await screen.findByRole('button', { name: '2026-08' }));
    expect(await screen.findByText('日次実績')).toBeInTheDocument();
    expect(screen.getByText('設計・実装')).toBeInTheDocument();
    expect(screen.getByText(/顧客担当者/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: contract.title }),
    ).toBeInTheDocument();
  });

  it('filters monthly work logs by query, status, and month', async () => {
    window.history.replaceState({}, '', '/work-logs');
    const listWorkLogs = vi.fn(() =>
      Promise.resolve({
        items: [workLog],
        page: { limit: 50, nextCursor: null },
      }),
    );
    render(<App auth={auth()} api={api({ listWorkLogs })} />);
    await screen.findByText('2026-08');
    fireEvent.change(
      screen.getByLabelText('契約番号、契約件名または技術者名で検索'),
      { target: { value: '青波' } },
    );
    fireEvent.change(screen.getByLabelText('月次実績状態'), {
      target: { value: 'approved' },
    });
    fireEvent.change(screen.getByLabelText('対象月'), {
      target: { value: '2026-08' },
    });
    await waitFor(() =>
      expect(listWorkLogs).toHaveBeenLastCalledWith({
        q: '青波',
        status: 'approved',
        workMonth: '2026-08-01',
      }),
    );
  });

  it('lists engagements and opens conditions and status history', async () => {
    window.history.replaceState({}, '', '/engagements');
    const client = api({
      listEngagements: vi.fn(() =>
        Promise.resolve({
          items: [engagement],
          page: { limit: 50, nextCursor: null },
        }),
      ),
      getEngagement: vi.fn(() => Promise.resolve(engagement)),
    });
    render(<App auth={auth()} api={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'ENG-000001' }));
    expect(await screen.findByText('条件履歴')).toBeInTheDocument();
    expect(screen.getByText(/900,000 JPY/)).toBeInTheDocument();
    expect(screen.getByText(/参画開始/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: contract.title }),
    ).toBeInTheDocument();
  });

  it('filters engagement list by query and status', async () => {
    window.history.replaceState({}, '', '/engagements');
    const listEngagements = vi.fn(() =>
      Promise.resolve({
        items: [engagement],
        page: { limit: 50, nextCursor: null },
      }),
    );
    render(<App auth={auth()} api={api({ listEngagements })} />);
    await screen.findByText('ENG-000001');
    fireEvent.change(
      screen.getByLabelText('参画番号、契約件名または技術者名で検索'),
      { target: { value: '青波' } },
    );
    fireEvent.change(screen.getByLabelText('参画状態'), {
      target: { value: 'active' },
    });
    await waitFor(() =>
      expect(listEngagements).toHaveBeenLastCalledWith({
        q: '青波',
        status: 'active',
      }),
    );
  });

  it('creates a manual engagement draft with initial conditions', async () => {
    window.history.replaceState({}, '', '/engagements/new');
    const created = { ...engagement, status: 'draft' as const, rowVersion: 1 };
    const createEngagement = vi
      .fn<(input: EngagementInput) => Promise<Engagement>>()
      .mockResolvedValue(created);
    render(<App auth={auth()} api={api({ createEngagement })} />);
    fireEvent.change(await screen.findByLabelText('参画番号'), {
      target: { value: engagement.engagementNo },
    });
    fireEvent.change(screen.getByLabelText('契約ID'), {
      target: { value: engagement.contractId },
    });
    fireEvent.change(screen.getByLabelText('技術者ID'), {
      target: { value: engagement.engineerId },
    });
    fireEvent.change(screen.getByLabelText('参画予定開始日'), {
      target: { value: '2026-09-01' },
    });
    fireEvent.change(screen.getByLabelText('月額売上'), {
      target: { value: '900000' },
    });
    fireEvent.click(screen.getByRole('button', { name: '参画を登録' }));
    await waitFor(() => expect(createEngagement).toHaveBeenCalledOnce());
    const saved = createEngagement.mock.calls[0]![0];
    expect(saved.engagementNo).toBe(engagement.engagementNo);
    expect(saved.contractId).toBe(engagement.contractId);
    expect(saved.condition.effectiveFrom).toBe('2026-09-01');
    expect(saved.condition.monthlySalesAmount).toBe(900000);
  });

  it('moves a draft engagement into preparation with optimistic locking', async () => {
    const draft = { ...engagement, status: 'draft' as const };
    window.history.replaceState({}, '', `/engagements/${draft.id}`);
    const transitionEngagementStatus = vi.fn(() =>
      Promise.resolve({
        ...draft,
        status: 'preparing' as const,
        rowVersion: 3,
      }),
    );
    render(
      <App
        auth={auth()}
        api={api({
          getEngagement: () => Promise.resolve(draft),
          transitionEngagementStatus,
        })}
      />,
    );
    fireEvent.change(await screen.findByLabelText('次の参画状態'), {
      target: { value: 'preparing' },
    });
    fireEvent.change(screen.getByLabelText('変更理由'), {
      target: { value: '開始準備を確認' },
    });
    fireEvent.click(screen.getByRole('button', { name: '参画状態を更新' }));
    await waitFor(() =>
      expect(transitionEngagementStatus).toHaveBeenCalledWith(draft.id, 2, {
        status: 'preparing',
        reason: '開始準備を確認',
        actualDate: null,
      }),
    );
  });

  it('lists safe contract summaries and opens restricted detail', async () => {
    window.history.replaceState({}, '', '/contracts');
    const client = api({
      listContracts: vi.fn(() =>
        Promise.resolve({
          items: [contract],
          page: { limit: 50, nextCursor: null },
        }),
      ),
      getContract: vi.fn(() => Promise.resolve(contract)),
    });
    render(<App auth={auth()} api={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'CN-000001' }));
    expect(await screen.findByText('月額')).toBeInTheDocument();
    expect(screen.getByText('900,000 JPY')).toBeInTheDocument();
    expect(screen.getByText('月末締め翌月末払い')).toBeInTheDocument();
    expect(screen.getByText(/第1版/)).toBeInTheDocument();
  });

  it('creates a contract draft with commercial terms and a party', async () => {
    window.history.replaceState({}, '', '/contracts/new');
    const created = { ...contract, status: 'draft' as const };
    const createContract = vi
      .fn<(input: ContractInput) => Promise<Contract>>()
      .mockResolvedValue(created);
    render(<App auth={auth()} api={api({ createContract })} />);
    fireEvent.change(await screen.findByLabelText('契約番号'), {
      target: { value: contract.contractNo },
    });
    fireEvent.change(screen.getByLabelText('件名'), {
      target: { value: contract.title },
    });
    fireEvent.change(screen.getByLabelText(/案件ID/), {
      target: { value: project.id },
    });
    fireEvent.change(screen.getByLabelText('開始日'), {
      target: { value: contract.startDate },
    });
    fireEvent.click(screen.getByRole('button', { name: '契約当事者を追加' }));
    fireEvent.change(screen.getByLabelText('会社ID'), {
      target: { value: company.id },
    });
    fireEvent.click(screen.getByRole('button', { name: '契約を登録' }));
    await waitFor(() => expect(createContract).toHaveBeenCalledOnce());
    const saved = createContract.mock.calls[0]![0];
    expect(saved.projectId).toBe(project.id);
    expect(saved.parties).toHaveLength(1);
    expect(saved.parties[0]!.companyId).toBe(company.id);
  });

  it('submits a draft contract for approval with optimistic locking', async () => {
    window.history.replaceState({}, '', `/contracts/${contract.id}`);
    const draft = { ...contract, status: 'draft' as const };
    const transitionContractStatus = vi.fn(() =>
      Promise.resolve({ ...draft, status: 'review' as const, rowVersion: 2 }),
    );
    render(
      <App
        auth={auth()}
        api={api({
          getContract: vi.fn(() => Promise.resolve(draft)),
          transitionContractStatus,
        })}
      />,
    );
    fireEvent.change(await screen.findByLabelText('次の状態'), {
      target: { value: 'review' },
    });
    fireEvent.change(screen.getByLabelText('依頼・判断理由'), {
      target: { value: '条件確認をお願いします' },
    });
    fireEvent.click(screen.getByRole('button', { name: '承認状態を更新' }));
    await waitFor(() =>
      expect(transitionContractStatus).toHaveBeenCalledOnce(),
    );
    expect(transitionContractStatus).toHaveBeenCalledWith(contract.id, 1, {
      status: 'review',
      reason: '条件確認をお願いします',
    });
  });

  it('lists interviews and opens interview detail', async () => {
    window.history.replaceState({}, '', '/interviews');
    const client = api({
      listInterviews: vi.fn(() =>
        Promise.resolve({
          items: [interview],
          page: { limit: 50, nextCursor: null },
        }),
      ),
      getInterview: vi.fn(() => Promise.resolve(interview)),
    });
    render(<App auth={auth()} api={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'PR-000001' }));
    expect(await screen.findByText('案件ポジションID')).toBeInTheDocument();
    expect(screen.getByText('予定確定')).toBeInTheDocument();
    expect(screen.getByText('経歴書を確認する')).toBeInTheDocument();
    expect(screen.getByText('候補日時')).toBeInTheDocument();
  });

  it('creates a tentative interview with a schedule candidate', async () => {
    window.history.replaceState({}, '', '/interviews/new');
    const created = { ...interview, status: 'tentative' as const };
    const createInterview = vi
      .fn<(input: InterviewInput) => Promise<Interview>>()
      .mockResolvedValue(created);
    render(<App auth={auth()} api={api({ createInterview })} />);
    fireEvent.change(await screen.findByLabelText('提案ID'), {
      target: { value: proposal.id },
    });
    fireEvent.click(screen.getByRole('button', { name: '候補日時を追加' }));
    fireEvent.change(screen.getByLabelText('候補1開始'), {
      target: { value: '2026-08-19T10:00' },
    });
    fireEvent.change(screen.getByLabelText('候補1終了'), {
      target: { value: '2026-08-19T11:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(createInterview).toHaveBeenCalledOnce());
    const saved = createInterview.mock.calls[0]![0];
    expect(saved.proposalId).toBe(proposal.id);
    expect(saved.interviewRound).toBe(1);
    expect(saved.status).toBe('tentative');
    expect(saved.scheduleCandidates).toHaveLength(1);
    expect(saved.scheduleCandidates[0]!.startAt).toMatch(/^2026-08-19T/);
    expect(saved.scheduleCandidates[0]!.endAt).toMatch(/^2026-08-19T/);
  });

  it('records an interview participant and completed result', async () => {
    window.history.replaceState({}, '', `/interviews/${interview.id}/result`);
    const completed = {
      ...interview,
      status: 'completed' as const,
      rowVersion: 2,
    };
    const saveInterviewResult = vi
      .fn<ProjectsApi['saveInterviewResult']>()
      .mockResolvedValue(completed);
    render(
      <App
        auth={auth()}
        api={api({
          getInterview: vi.fn(() => Promise.resolve(interview)),
          saveInterviewResult,
        })}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: '参加者を追加' }),
    );
    fireEvent.change(screen.getByLabelText('表示名'), {
      target: { value: '顧客担当者' },
    });
    fireEvent.change(screen.getByLabelText('判定'), {
      target: { value: 'pass' },
    });
    fireEvent.change(screen.getByLabelText('決定日時'), {
      target: { value: '2026-08-20T11:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: '参加者・結果を保存' }));
    await waitFor(() => expect(saveInterviewResult).toHaveBeenCalledOnce());
    const [savedId, savedVersion, saved] = saveInterviewResult.mock.calls[0]!;
    expect(savedId).toBe(interview.id);
    expect(savedVersion).toBe(1);
    expect(saved.status).toBe('completed');
    expect(saved.participants).toHaveLength(1);
    expect(saved.participants[0]).toMatchObject({
      participantType: 'other',
      displayName: '顧客担当者',
      attendanceStatus: 'attended',
    });
    expect(saved.outcome?.outcome).toBe('pass');
  });

  it('lists proposals and opens proposal detail', async () => {
    window.history.replaceState({}, '', '/proposals');
    const client = api({
      listProposals: vi.fn(() =>
        Promise.resolve({
          items: [proposal],
          page: { limit: 50, nextCursor: null },
        }),
      ),
      getProposal: vi.fn(() => Promise.resolve(proposal)),
    });
    render(<App auth={auth()} api={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'PR-000001' }));
    expect(await screen.findByText('案件ポジションID')).toBeInTheDocument();
    expect(screen.getByText('送付済み')).toBeInTheDocument();
  });
  it('creates a draft proposal from the proposal form', async () => {
    window.history.replaceState({}, '', '/proposals/new');
    const created = { ...proposal, status: 'draft' as const };
    const createProposal = vi.fn(() => Promise.resolve(created));
    render(<App auth={auth()} api={api({ createProposal })} />);
    fireEvent.change(await screen.findByLabelText('提案番号'), {
      target: { value: created.managementNo },
    });
    fireEvent.change(screen.getByLabelText('案件ポジションID'), {
      target: { value: created.projectPositionId },
    });
    fireEvent.change(screen.getByLabelText('技術者ID'), {
      target: { value: created.engineerId },
    });
    fireEvent.change(screen.getByLabelText('提出先会社ID'), {
      target: { value: created.destinationCompanyId },
    });
    fireEvent.click(screen.getByRole('button', { name: '提案を登録' }));
    await waitFor(() => expect(createProposal).toHaveBeenCalledOnce());
  });
  it('transitions proposal status with optimistic locking', async () => {
    window.history.replaceState({}, '', `/proposals/${proposal.id}`);
    const transitionProposalStatus = vi.fn(() =>
      Promise.resolve({ ...proposal, status: 'lost' as const, rowVersion: 2 }),
    );
    render(
      <App
        auth={auth()}
        api={api({
          getProposal: () => Promise.resolve(proposal),
          transitionProposalStatus,
        })}
      />,
    );
    fireEvent.change(await screen.findByLabelText('次の状態'), {
      target: { value: 'lost' },
    });
    fireEvent.change(screen.getByLabelText('変更理由'), {
      target: { value: '条件不一致' },
    });
    fireEvent.click(screen.getByRole('button', { name: '状態を更新' }));
    await waitFor(() =>
      expect(transitionProposalStatus).toHaveBeenCalledWith(proposal.id, 1, {
        status: 'lost',
        reason: '条件不一致',
      }),
    );
  });
  it('wins an offered proposal and shows generated draft links', async () => {
    const offered = { ...proposal, status: 'offered' as const };
    window.history.replaceState({}, '', `/proposals/${offered.id}`);
    const winProposal = vi.fn(() =>
      Promise.resolve({
        proposal: { ...offered, status: 'won' as const, rowVersion: 2 },
        contractId: contract.id,
        engagementId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        created: true,
      }),
    );
    render(
      <App
        auth={auth()}
        api={api({
          getProposal: () => Promise.resolve(offered),
          winProposal,
        })}
      />,
    );
    fireEvent.change(await screen.findByLabelText('次の状態'), {
      target: { value: 'won' },
    });
    fireEvent.click(screen.getByRole('button', { name: '状態を更新' }));
    await waitFor(() =>
      expect(winProposal).toHaveBeenCalledWith(offered.id, 1),
    );
    expect(
      await screen.findByText(/契約・参画の下書きを生成しました/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '契約下書きを確認' }),
    ).toHaveAttribute('href', `/contracts/${contract.id}`);
    expect(
      screen.getByRole('link', { name: '参画下書きを確認' }),
    ).toHaveAttribute(
      'href',
      '/engagements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
  });
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
    await act(async () => {
      fireEvent.change(screen.getByLabelText('電話'), {
        target: { value: '090-0000-0000' },
      });
      await Promise.resolve();
    });
    expect(screen.getByLabelText('電話')).toHaveValue('090-0000-0000');
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
