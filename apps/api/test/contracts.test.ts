import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  Contract,
  ContractInput,
  ContractRepository,
  ContractSummary,
} from '../src/modules/contracts/contract-repository.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';

const summary: ContractSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  contractNo: 'CN-000001',
  projectId: '22222222-2222-4222-8222-222222222222',
  proposalId: '33333333-3333-4333-8333-333333333333',
  engineerId: '44444444-4444-4444-8444-444444444444',
  contractType: 'ses',
  status: 'active',
  title: '基幹システム刷新 SES契約',
  startDate: '2026-09-01',
  endDate: '2027-02-28',
  autoRenew: true,
  currency: 'JPY',
  updatedAt: '2026-08-12T00:00:00Z',
  rowVersion: 2,
};

const contract: Contract = {
  ...summary,
  monthlyAmount: 900000,
  hourlyAmount: null,
  settlementLowerHours: 140,
  settlementUpperHours: 180,
  paymentTerms: '月末締め翌月末払い',
  notes: '更新確認は終了日の30日前',
  parties: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      companyId: '66666666-6666-4666-8666-666666666666',
      contactId: null,
      partyRole: 'customer',
      billingRole: 'bill_to',
      isPrimary: true,
    },
  ],
  versions: [
    {
      id: '77777777-7777-4777-8777-777777777777',
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
};

const input: ContractInput = {
  contractNo: contract.contractNo,
  projectId: contract.projectId,
  proposalId: contract.proposalId,
  engineerId: contract.engineerId,
  contractType: contract.contractType,
  title: contract.title,
  startDate: contract.startDate,
  endDate: contract.endDate,
  autoRenew: contract.autoRenew,
  currency: contract.currency,
  monthlyAmount: contract.monthlyAmount,
  hourlyAmount: contract.hourlyAmount,
  settlementLowerHours: contract.settlementLowerHours,
  settlementUpperHours: contract.settlementUpperHours,
  paymentTerms: contract.paymentTerms,
  notes: contract.notes,
  parties: contract.parties.map((party) => ({
    companyId: party.companyId,
    contactId: party.contactId,
    partyRole: party.partyRole,
    billingRole: party.billingRole,
    isPrimary: party.isPrimary,
  })),
  changeSummary: 'Initial draft',
};

const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function repository(
  overrides: Partial<ContractRepository> = {},
): ContractRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    canManage: vi.fn(() => Promise.resolve(true)),
    canApprove: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() => Promise.resolve({ items: [summary], nextCursor: null })),
    findById: vi.fn(() => Promise.resolve(contract)),
    create: vi.fn(() =>
      Promise.resolve({ ...contract, status: 'draft' as const }),
    ),
    update: vi.fn(() =>
      Promise.resolve({ ...contract, status: 'draft' as const }),
    ),
    transitionStatus: vi.fn(() => Promise.resolve(contract)),
    ...overrides,
  };
}

function app(contracts = repository()) {
  const instance = buildApp({ authentication, contracts });
  apps.push(instance);
  return instance;
}

describe('contract read API', () => {
  it('lists safe RLS-visible contract summaries', async () => {
    const list = vi.fn(() =>
      Promise.resolve({ items: [summary], nextCursor: null }),
    );
    const response = await app(repository({ list })).inject({
      method: 'GET',
      url: '/api/v1/contracts?q=CN-000001&status=active&limit=20',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [summary],
      page: { limit: 20, nextCursor: null },
    });
    expect(list).toHaveBeenCalledWith('valid', {
      limit: 20,
      query: 'CN-000001',
      status: 'active',
    });
  });

  it('requires contract.read', async () => {
    const response = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: '/api/v1/contracts',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('returns restricted contract detail', async () => {
    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/contracts/${contract.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(contract);
  });

  it('normalizes an inaccessible contract to 404', async () => {
    const response = await app(
      repository({ findById: vi.fn(() => Promise.resolve(null)) }),
    ).inject({
      method: 'GET',
      url: `/api/v1/contracts/${contract.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('rejects an unknown status before repository access', async () => {
    const response = await app().inject({
      method: 'GET',
      url: '/api/v1/contracts?status=unknown',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('contract write and approval API', () => {
  it('creates a draft contract through the limited RPC repository path', async () => {
    const create = vi.fn(() =>
      Promise.resolve({ ...contract, status: 'draft' as const, rowVersion: 1 }),
    );
    const response = await app(repository({ create })).inject({
      method: 'POST',
      url: '/api/v1/contracts',
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers.etag).toBe('"1"');
    expect(create).toHaveBeenCalledWith('valid', input, expect.any(String));
  });

  it('requires contract.manage when creating a contract', async () => {
    const response = await app(
      repository({ canManage: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: '/api/v1/contracts',
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(response.statusCode).toBe(403);
  });

  it('uses If-Match when updating a draft contract', async () => {
    const update = vi.fn(() =>
      Promise.resolve({ ...contract, status: 'draft' as const, rowVersion: 3 }),
    );
    const response = await app(repository({ update })).inject({
      method: 'PUT',
      url: `/api/v1/contracts/${contract.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: input,
    });
    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(
      'valid',
      contract.id,
      2,
      input,
      expect.any(String),
    );
  });

  it('submits a draft contract for review with contract.manage', async () => {
    const transitionStatus = vi.fn(() =>
      Promise.resolve({
        ...contract,
        status: 'review' as const,
        rowVersion: 3,
      }),
    );
    const response = await app(repository({ transitionStatus })).inject({
      method: 'POST',
      url: `/api/v1/contracts/${contract.id}/status`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: { status: 'review', reason: 'Please review the initial terms' },
    });
    expect(response.statusCode).toBe(200);
    expect(transitionStatus).toHaveBeenCalledWith(
      'valid',
      contract.id,
      2,
      'review',
      'Please review the initial terms',
      expect.any(String),
    );
  });

  it('requires contract.approve to activate a reviewed contract', async () => {
    const response = await app(
      repository({ canApprove: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/contracts/${contract.id}/status`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: { status: 'active', reason: 'Terms confirmed' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('requires a reason when returning a reviewed contract to draft', async () => {
    const response = await app().inject({
      method: 'POST',
      url: `/api/v1/contracts/${contract.id}/status`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: { status: 'draft' },
    });
    expect(response.statusCode).toBe(400);
  });
});
