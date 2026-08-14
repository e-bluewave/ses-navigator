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
  WorkLogInput,
  Invoice,
  AccountingPeriod,
  AccountingExportBatch,
  Expense,
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
  statusHistories: [
    {
      id: '13131313-1313-4313-8313-131313131313',
      fromStatus: 'submitted',
      toStatus: 'approved',
      changeReason: '顧客承認済み',
      changedAt: '2026-09-03T00:00:00Z',
    },
  ],
  approval: {
    id: '14141414-1414-4414-8414-141414141414',
    status: 'approved',
    requestedAt: '2026-09-01T00:00:00Z',
    completedAt: '2026-09-03T00:00:00Z',
    requestNote: '確認をお願いします',
    decisionNote: '顧客承認済み',
  },
};

const invoice: Invoice = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  invoiceNo: 'INV-2026-0001',
  invoiceType: 'sales',
  contractId: contract.id,
  contractTitle: contract.title,
  billingCompanyId: '22222222-2222-4222-8222-222222222222',
  billingCompanyName: '青波株式会社',
  billingPeriodStart: '2026-07-01',
  billingPeriodEnd: '2026-07-31',
  issueDate: '2026-08-01',
  dueDate: '2026-08-31',
  status: 'partially_paid',
  currency: 'JPY',
  subtotal: 1000000,
  taxAmount: 100000,
  totalAmount: 1100000,
  paidAmount: 500000,
  balanceAmount: 600000,
  sentAt: '2026-08-02T00:00:00Z',
  updatedAt: '2026-08-10T00:00:00Z',
  rowVersion: 2,
  billingAccount: {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    companyId: '22222222-2222-4222-8222-222222222222',
    accountType: 'receivable',
    accountName: '本社請求先',
    closingDay: 31,
    paymentMonthOffset: 1,
    paymentDay: 31,
    invoiceDeliveryMethod: 'email',
    isDefault: true,
  },
  items: [
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      lineNo: 1,
      itemType: 'service',
      description: '7月分技術支援',
      quantity: 1,
      unit: '式',
      unitPrice: 1000000,
      taxRate: 10,
      amount: 1000000,
      taxAmount: 100000,
      workLogId: null,
      displayOrder: 1,
    },
  ],
  payments: [
    {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      paymentType: 'receipt',
      paymentDate: '2026-08-10',
      amount: 500000,
      currency: 'JPY',
      paymentMethod: 'bank_transfer',
      bankFeeAmount: 0,
    },
  ],
  statusHistories: [],
};

const supplierInvoice: Invoice = {
  ...invoice,
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  invoiceNo: 'PINV-2026-0001',
  invoiceType: 'purchase',
  billingCompanyName: 'BPパートナー株式会社',
  status: 'overdue',
  billingAccount: {
    ...invoice.billingAccount,
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    accountType: 'payable',
    accountName: '本社支払先',
  },
  payments: [],
};

const accountingPeriod: AccountingPeriod = {
  id: 'abababab-abab-4bab-8bab-abababababab',
  periodMonth: '2026-08-01',
  salesStatus: 'open',
  invoiceStatus: 'open',
  paymentStatus: 'open',
  salesClosedAt: null,
  invoiceClosedAt: null,
  paymentClosedAt: null,
  updatedAt: '2026-08-14T00:00:00Z',
  rowVersion: 1,
  statusHistories: [],
};

const accountingExport: AccountingExportBatch = {
  id: 'bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc',
  accountingPeriodId: accountingPeriod.id,
  periodMonth: '2026-08-01',
  versionNo: 1,
  exportFormat: 'generic_csv',
  status: 'generated',
  generatedAt: '2026-08-14T02:00:00Z',
  exportedAt: null,
  exportReference: null,
  lineCount: 2,
  debitTotal: 110000,
  creditTotal: 110000,
  updatedAt: '2026-08-14T02:00:00Z',
  rowVersion: 1,
  lines: [
    {
      id: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
      lineNo: 1,
      entryDate: '2026-08-01',
      accountCode: '1200',
      accountName: '売掛金',
      debitAmount: 110000,
      creditAmount: 0,
      currency: 'JPY',
      description: '請求 INV-001',
      sourceType: 'invoice',
      sourceId: invoice.id,
    },
  ],
};

const expense: Expense = {
  id: 'dededede-dede-4ded-8ded-dededededede',
  contractId: null,
  workLogId: null,
  engineerId: null,
  contractNo: null,
  contractTitle: null,
  engineerName: null,
  expenseDate: '2026-08-14',
  expenseType: 'transportation',
  description: '顧客訪問交通費',
  amount: 1200,
  taxAmount: 109,
  currency: 'JPY',
  status: 'draft',
  billable: false,
  invoiceId: null,
  approvedAt: null,
  updatedAt: '2026-08-14T03:00:00Z',
  rowVersion: 1,
  receiptPath: null,
  notes: null,
  statusHistories: [],
  approval: null,
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
    listExpenses: vi.fn(() => Promise.resolve({ items: [] })),
    getExpense: vi.fn(() => Promise.reject(new Error('not configured'))),
    createExpense: vi.fn(() => Promise.reject(new Error('not configured'))),
    updateExpense: vi.fn(() => Promise.reject(new Error('not configured'))),
    transitionExpenseStatus: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    listAccountingExports: vi.fn(() => Promise.resolve({ items: [] })),
    getAccountingExport: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    generateAccountingExport: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    markAccountingExported: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    listAccountingPeriods: vi.fn(() => Promise.resolve({ items: [] })),
    getAccountingPeriod: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    createAccountingPeriod: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    transitionAccountingPeriodStatus: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    listInvoices: vi.fn(() =>
      Promise.resolve({ items: [], page: { limit: 50, nextCursor: null } }),
    ),
    getInvoice: vi.fn(() => Promise.reject(new Error('not configured'))),
    getInvoiceOptions: vi.fn(() =>
      Promise.resolve({
        billingAccounts: [
          {
            id: invoice.billingAccount.id,
            companyId: invoice.billingCompanyId,
            companyName: invoice.billingCompanyName,
            accountType: 'receivable' as const,
            accountName: invoice.billingAccount.accountName,
            closingDay: 31,
            paymentMonthOffset: 1,
            paymentDay: 31,
            invoiceDeliveryMethod: 'email' as const,
            isDefault: true,
          },
        ],
      }),
    ),
    createInvoice: vi.fn(() => Promise.reject(new Error('not configured'))),
    updateInvoice: vi.fn(() => Promise.reject(new Error('not configured'))),
    transitionInvoiceStatus: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    registerInvoicePayment: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    reverseInvoicePayment: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
    listWorkLogs: vi.fn(() =>
      Promise.resolve({ items: [], page: { limit: 50, nextCursor: null } }),
    ),
    getWorkLog: vi.fn(() => Promise.reject(new Error('not configured'))),
    createWorkLog: vi.fn(() => Promise.reject(new Error('not configured'))),
    updateWorkLog: vi.fn(() => Promise.reject(new Error('not configured'))),
    transitionWorkLogStatus: vi.fn(() =>
      Promise.reject(new Error('not configured')),
    ),
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
  it('creates and submits an expense', async () => {
    window.history.replaceState({}, '', '/expenses');
    const createExpense = vi.fn(() => Promise.resolve(expense));
    const transitionExpenseStatus = vi.fn(() =>
      Promise.resolve({
        ...expense,
        status: 'submitted' as const,
        rowVersion: 2,
      }),
    );
    render(
      <App
        auth={auth()}
        api={api({
          listExpenses: vi.fn(() => Promise.resolve({ items: [expense] })),
          getExpense: vi.fn(() => Promise.resolve(expense)),
          createExpense,
          transitionExpenseStatus,
        })}
      />,
    );
    fireEvent.change(await screen.findByLabelText('経費内容'), {
      target: { value: '新幹線代' },
    });
    fireEvent.change(screen.getByLabelText('経費金額'), {
      target: { value: '12000' },
    });
    fireEvent.click(screen.getByRole('button', { name: '下書きを保存' }));
    await waitFor(() =>
      expect(createExpense).toHaveBeenCalledWith(
        expect.objectContaining({ description: '新幹線代', amount: 12000 }),
      ),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: '承認待ちにする' }),
    );
    await waitFor(() =>
      expect(transitionExpenseStatus).toHaveBeenCalledWith(expense.id, 1, {
        status: 'submitted',
        reason: null,
      }),
    );
  });

  it('generates, opens, and marks an accounting export as exported', async () => {
    window.history.replaceState({}, '', '/accounting-exports');
    const generateAccountingExport = vi.fn(() =>
      Promise.resolve(accountingExport),
    );
    const markAccountingExported = vi.fn(() =>
      Promise.resolve({
        ...accountingExport,
        status: 'exported' as const,
        exportReference: 'job-42',
        rowVersion: 2,
      }),
    );
    render(
      <App
        auth={auth()}
        api={api({
          listAccountingExports: vi.fn(() =>
            Promise.resolve({ items: [accountingExport] }),
          ),
          listAccountingPeriods: vi.fn(() =>
            Promise.resolve({ items: [accountingPeriod] }),
          ),
          getAccountingExport: vi.fn(() => Promise.resolve(accountingExport)),
          generateAccountingExport,
          markAccountingExported,
        })}
      />,
    );
    const generateButton = await screen.findByRole('button', {
      name: '仕訳を生成',
    });
    await waitFor(() => expect(generateButton).toBeEnabled());
    fireEvent.click(generateButton);
    await waitFor(() =>
      expect(generateAccountingExport).toHaveBeenCalledWith({
        accountingPeriodId: accountingPeriod.id,
        exportFormat: 'generic_csv',
      }),
    );
    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: '2026-08 v1 仕訳明細',
      }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('外部出力参照'), {
      target: { value: 'job-42' },
    });
    fireEvent.click(screen.getByRole('button', { name: '出力済みにする' }));
    await waitFor(() =>
      expect(markAccountingExported).toHaveBeenCalledWith(
        accountingExport.id,
        1,
        { exportReference: 'job-42' },
      ),
    );
  });

  it('creates and closes an accounting period in order', async () => {
    window.history.replaceState({}, '', '/accounting-periods');
    const listAccountingPeriods = vi.fn(() =>
      Promise.resolve({ items: [accountingPeriod] }),
    );
    const createAccountingPeriod = vi.fn(() =>
      Promise.resolve(accountingPeriod),
    );
    const closed = {
      ...accountingPeriod,
      salesStatus: 'closed' as const,
      salesClosedAt: '2026-08-14T01:00:00Z',
      rowVersion: 2,
      statusHistories: [
        {
          id: 'acacacac-acac-4cac-8cac-acacacacacac',
          closeType: 'sales' as const,
          fromStatus: 'open' as const,
          toStatus: 'closed' as const,
          changeReason: null,
          impactConfirmed: false,
          changedAt: '2026-08-14T01:00:00Z',
          changedBy: 'adadadad-adad-4dad-8dad-adadadadadad',
        },
      ],
    };
    const transitionAccountingPeriodStatus = vi.fn(() =>
      Promise.resolve(closed),
    );
    render(
      <App
        auth={auth()}
        api={api({
          listAccountingPeriods,
          getAccountingPeriod: vi.fn(() => Promise.resolve(accountingPeriod)),
          createAccountingPeriod,
          transitionAccountingPeriodStatus,
        })}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: '2026-08' }));
    expect(await screen.findByText('2026-08 の締め操作')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '締め状態を更新' }));
    await waitFor(() =>
      expect(transitionAccountingPeriodStatus).toHaveBeenCalledWith(
        accountingPeriod.id,
        1,
        {
          closeType: 'sales',
          status: 'closed',
          reason: null,
          impactConfirmed: false,
        },
      ),
    );
    expect(
      await screen.findByText(/2026\/8\/14.*売上締め/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('会計期間の対象月'), {
      target: { value: '2026-09' },
    });
    fireEvent.click(screen.getByRole('button', { name: '会計期間を作成' }));
    await waitFor(() =>
      expect(createAccountingPeriod).toHaveBeenCalledWith({
        periodMonth: '2026-09-01',
      }),
    );
  });

  it('requires a reason and impact confirmation before reopening a period', async () => {
    window.history.replaceState({}, '', '/accounting-periods');
    const closed = {
      ...accountingPeriod,
      salesStatus: 'closed' as const,
      salesClosedAt: '2026-08-14T01:00:00Z',
      rowVersion: 2,
    };
    const transitionAccountingPeriodStatus = vi.fn(() =>
      Promise.resolve({ ...accountingPeriod, rowVersion: 3 }),
    );
    render(
      <App
        auth={auth()}
        api={api({
          listAccountingPeriods: vi.fn(() =>
            Promise.resolve({ items: [closed] }),
          ),
          getAccountingPeriod: vi.fn(() => Promise.resolve(closed)),
          transitionAccountingPeriodStatus,
        })}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: '2026-08' }));
    fireEvent.change(await screen.findByLabelText('次の締め状態'), {
      target: { value: 'open' },
    });
    const update = screen.getByRole('button', { name: '締め状態を更新' });
    expect(update).toBeDisabled();
    fireEvent.change(screen.getByLabelText('締め状態の変更理由'), {
      target: { value: '請求金額の訂正' },
    });
    fireEvent.click(
      screen.getByLabelText('後続の請求・支払・会計出力への影響を確認した'),
    );
    fireEvent.click(update);
    await waitFor(() =>
      expect(transitionAccountingPeriodStatus).toHaveBeenCalledWith(
        accountingPeriod.id,
        2,
        {
          closeType: 'sales',
          status: 'open',
          reason: '請求金額の訂正',
          impactConfirmed: true,
        },
      ),
    );
  });

  it('lists supplier payment plans and registers a purchase payment', async () => {
    window.history.replaceState({}, '', '/supplier-payments');
    const listInvoices = vi.fn(() =>
      Promise.resolve({
        items: [supplierInvoice],
        page: { limit: 100, nextCursor: null },
      }),
    );
    const registerInvoicePayment = vi.fn(() =>
      Promise.resolve({
        ...supplierInvoice,
        status: 'paid' as const,
        paidAmount: supplierInvoice.totalAmount,
        balanceAmount: 0,
        rowVersion: supplierInvoice.rowVersion + 1,
      }),
    );
    render(
      <App
        auth={auth()}
        api={api({
          listInvoices,
          getInvoice: vi.fn(() => Promise.resolve(supplierInvoice)),
          registerInvoicePayment,
        })}
      />,
    );

    expect(await screen.findByText('BPパートナー株式会社')).toBeInTheDocument();
    expect(listInvoices).toHaveBeenCalledWith({
      invoiceType: 'purchase',
      limit: 100,
    });
    expect(screen.getByText('期限超過')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: supplierInvoice.invoiceNo }),
    );
    expect(await screen.findByText('支払履歴')).toBeInTheDocument();
    expect(screen.getByLabelText('支払種別')).toHaveValue('payment');
    fireEvent.click(screen.getByRole('button', { name: '支払を登録して消込' }));
    await waitFor(() =>
      expect(registerInvoicePayment).toHaveBeenCalledWith(
        supplierInvoice.id,
        supplierInvoice.rowVersion,
        expect.objectContaining({
          paymentType: 'payment',
          amount: supplierInvoice.balanceAmount,
          currency: 'JPY',
        }),
      ),
    );
  });

  it('filters supplier payment plans while keeping purchase invoices scoped', async () => {
    window.history.replaceState({}, '', '/supplier-payments');
    const listInvoices = vi.fn(() =>
      Promise.resolve({ items: [], page: { limit: 100, nextCursor: null } }),
    );
    render(<App auth={auth()} api={api({ listInvoices })} />);
    await screen.findByText('該当するBP支払予定はありません。');

    fireEvent.change(screen.getByLabelText('BP支払検索'), {
      target: { value: 'パートナー' },
    });
    fireEvent.change(screen.getByLabelText('BP支払状態'), {
      target: { value: 'overdue' },
    });
    fireEvent.change(screen.getByLabelText('支払期限（開始）'), {
      target: { value: '2026-08-01' },
    });
    fireEvent.change(screen.getByLabelText('支払期限（終了）'), {
      target: { value: '2026-08-31' },
    });

    await waitFor(() =>
      expect(listInvoices).toHaveBeenLastCalledWith({
        invoiceType: 'purchase',
        q: 'パートナー',
        status: 'overdue',
        dueFrom: '2026-08-01',
        dueTo: '2026-08-31',
        limit: 100,
      }),
    );
  });

  it('lists invoices and opens line and payment detail', async () => {
    window.history.replaceState({}, '', '/invoices');
    const client = api({
      listInvoices: vi.fn(() =>
        Promise.resolve({
          items: [invoice],
          page: { limit: 50, nextCursor: null },
        }),
      ),
      getInvoice: vi.fn(() => Promise.resolve(invoice)),
    });
    render(<App auth={auth()} api={client} />);
    fireEvent.click(
      await screen.findByRole('button', { name: invoice.invoiceNo }),
    );
    expect(await screen.findByText('請求明細')).toBeInTheDocument();
    expect(screen.getByText('7月分技術支援')).toBeInTheDocument();
    expect(screen.getByText('入金履歴')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: contract.title }),
    ).toBeInTheDocument();
  });

  it('filters invoices by query, status, type, and due dates', async () => {
    window.history.replaceState({}, '', '/invoices');
    const listInvoices = vi.fn(() =>
      Promise.resolve({
        items: [invoice],
        page: { limit: 50, nextCursor: null },
      }),
    );
    render(<App auth={auth()} api={api({ listInvoices })} />);
    await screen.findByText(invoice.invoiceNo);
    fireEvent.change(screen.getByLabelText('請求検索'), {
      target: { value: '青波' },
    });
    fireEvent.change(screen.getByLabelText('請求状態'), {
      target: { value: 'overdue' },
    });
    fireEvent.change(screen.getByLabelText('請求種別'), {
      target: { value: 'sales' },
    });
    fireEvent.change(screen.getByLabelText('期限（開始）'), {
      target: { value: '2026-08-01' },
    });
    fireEvent.change(screen.getByLabelText('期限（終了）'), {
      target: { value: '2026-08-31' },
    });
    await waitFor(() =>
      expect(listInvoices).toHaveBeenLastCalledWith({
        q: '青波',
        status: 'overdue',
        invoiceType: 'sales',
        dueFrom: '2026-08-01',
        dueTo: '2026-08-31',
        limit: 100,
      }),
    );
  });

  it('creates an invoice draft with one calculated line', async () => {
    window.history.replaceState({}, '', '/invoices/new');
    const created = { ...invoice, status: 'draft' as const };
    const createInvoice = vi.fn(() => Promise.resolve(created));
    render(
      <App
        auth={auth()}
        api={api({
          createInvoice,
          listContracts: vi.fn(() =>
            Promise.resolve({
              items: [contract],
              page: { limit: 200, nextCursor: null },
            }),
          ),
        })}
      />,
    );
    fireEvent.change(await screen.findByLabelText('請求番号'), {
      target: { value: 'INV-2026-0002' },
    });
    fireEvent.change(screen.getByLabelText('請求先設定'), {
      target: { value: invoice.billingAccount.id },
    });
    fireEvent.change(screen.getByLabelText('明細1内容'), {
      target: { value: '8月分技術支援' },
    });
    fireEvent.click(screen.getByRole('button', { name: '請求を登録' }));
    await waitFor(() => expect(createInvoice).toHaveBeenCalled());
  });

  it('issues a draft invoice with optimistic locking', async () => {
    window.history.replaceState({}, '', `/invoices/${invoice.id}`);
    const draft = { ...invoice, status: 'draft' as const };
    const transitionInvoiceStatus = vi.fn(() =>
      Promise.resolve({ ...draft, status: 'issued' as const, rowVersion: 3 }),
    );
    render(
      <App
        auth={auth()}
        api={api({
          getInvoice: vi.fn(() => Promise.resolve(draft)),
          transitionInvoiceStatus,
        })}
      />,
    );
    fireEvent.change(await screen.findByLabelText('次の請求状態'), {
      target: { value: 'issued' },
    });
    fireEvent.click(screen.getByRole('button', { name: '請求状態を更新' }));
    await waitFor(() =>
      expect(transitionInvoiceStatus).toHaveBeenCalledWith(
        invoice.id,
        invoice.rowVersion,
        { status: 'issued', reason: null },
      ),
    );
  });

  it('registers and reverses invoice payments from detail', async () => {
    window.history.replaceState({}, '', `/invoices/${invoice.id}`);
    const paid = {
      ...invoice,
      status: 'paid' as const,
      paidAmount: invoice.totalAmount,
      balanceAmount: 0,
      rowVersion: 3,
    };
    const registerInvoicePayment = vi.fn(() => Promise.resolve(paid));
    const reverseInvoicePayment = vi.fn(() =>
      Promise.resolve({ ...invoice, rowVersion: 4 }),
    );
    render(
      <App
        auth={auth()}
        api={api({
          getInvoice: vi.fn(() => Promise.resolve(invoice)),
          registerInvoicePayment,
          reverseInvoicePayment,
        })}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: '入金を登録して消込' }),
    );
    await waitFor(() =>
      expect(registerInvoicePayment).toHaveBeenCalledWith(
        invoice.id,
        invoice.rowVersion,
        expect.objectContaining({
          paymentType: 'receipt',
          amount: invoice.balanceAmount,
          currency: 'JPY',
        }),
      ),
    );
    fireEvent.change(screen.getByLabelText('入金取消理由'), {
      target: { value: '重複入金' },
    });
    fireEvent.click(screen.getByRole('button', { name: '入金を取消' }));
    await waitFor(() =>
      expect(reverseInvoicePayment).toHaveBeenCalledWith(
        invoice.id,
        invoice.payments[0]!.id,
        paid.rowVersion,
        { reason: '重複入金' },
      ),
    );
  });

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

  it('creates a monthly work log draft with a daily record', async () => {
    window.history.replaceState({}, '', '/work-logs/new');
    const created = { ...workLog, status: 'draft' as const, rowVersion: 1 };
    const createWorkLog = vi
      .fn<(input: WorkLogInput) => Promise<WorkLog>>()
      .mockResolvedValue(created);
    render(<App auth={auth()} api={api({ createWorkLog })} />);
    fireEvent.change(await screen.findByLabelText('契約ID'), {
      target: { value: workLog.contractId },
    });
    fireEvent.change(screen.getByLabelText('技術者ID'), {
      target: { value: workLog.engineerId },
    });
    fireEvent.change(screen.getByLabelText('対象月'), {
      target: { value: '2026-08' },
    });
    fireEvent.change(screen.getByLabelText('勤務日'), {
      target: { value: '2026-08-03' },
    });
    fireEvent.change(screen.getByLabelText('開始時刻'), {
      target: { value: '09:00' },
    });
    fireEvent.change(screen.getByLabelText('終了時刻'), {
      target: { value: '18:00' },
    });
    fireEvent.change(screen.getByLabelText('作業内容'), {
      target: { value: '設計・実装' },
    });
    fireEvent.click(screen.getByRole('button', { name: '月次実績を登録' }));
    await waitFor(() => expect(createWorkLog).toHaveBeenCalledOnce());
    const saved = createWorkLog.mock.calls[0]![0];
    expect(saved.workMonth).toBe('2026-08-01');
    expect(saved.details[0]).toMatchObject({
      workDate: '2026-08-03',
      workHours: 8,
      description: '設計・実装',
    });
  });

  it('submits a draft monthly work log with optimistic locking', async () => {
    const draft = {
      ...workLog,
      status: 'draft' as const,
      approval: null,
      rowVersion: 2,
    };
    window.history.replaceState({}, '', `/work-logs/${draft.id}`);
    const transitionWorkLogStatus = vi.fn(() =>
      Promise.resolve({
        ...draft,
        status: 'submitted' as const,
        rowVersion: 3,
      }),
    );
    render(
      <App
        auth={auth()}
        api={api({
          getWorkLog: () => Promise.resolve(draft),
          transitionWorkLogStatus,
        })}
      />,
    );
    fireEvent.change(await screen.findByLabelText('次の月次実績状態'), {
      target: { value: 'submitted' },
    });
    fireEvent.change(screen.getByLabelText('変更理由'), {
      target: { value: '確認をお願いします' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: '月次実績の状態を更新' }),
    );
    await waitFor(() =>
      expect(transitionWorkLogStatus).toHaveBeenCalledWith(draft.id, 2, {
        status: 'submitted',
        reason: '確認をお願いします',
        approvedByName: null,
      }),
    );
  });

  it('approves a submitted monthly work log with approver name', async () => {
    const submitted = {
      ...workLog,
      status: 'submitted' as const,
      customerApprovedAt: null,
      approvedByName: null,
      rowVersion: 4,
    };
    window.history.replaceState({}, '', `/work-logs/${submitted.id}`);
    const transitionWorkLogStatus = vi.fn(() => Promise.resolve(workLog));
    render(
      <App
        auth={auth()}
        api={api({
          getWorkLog: () => Promise.resolve(submitted),
          transitionWorkLogStatus,
        })}
      />,
    );
    fireEvent.change(await screen.findByLabelText('次の月次実績状態'), {
      target: { value: 'approved' },
    });
    fireEvent.change(screen.getByLabelText('顧客承認者名'), {
      target: { value: '顧客担当者' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: '月次実績の状態を更新' }),
    );
    await waitFor(() =>
      expect(transitionWorkLogStatus).toHaveBeenCalledWith(submitted.id, 4, {
        status: 'approved',
        reason: null,
        approvedByName: '顧客担当者',
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
