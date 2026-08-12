import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  Contract,
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
    list: vi.fn(() => Promise.resolve({ items: [summary], nextCursor: null })),
    findById: vi.fn(() => Promise.resolve(contract)),
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
