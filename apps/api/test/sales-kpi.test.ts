import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  SalesKpiDashboard,
  SalesKpiRepository,
} from '../src/modules/sales-kpi/sales-kpi-repository.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';
const dashboard: SalesKpiDashboard = {
  fromDate: '2026-01-01',
  toDate: '2026-08-14',
  contractExpiryDays: 60,
  proposalCount: 10,
  interviewProposalCount: 5,
  interviewRate: 50,
  wonCount: 2,
  winRate: 20,
  averageProposalDays: 12,
  averageInterviewCount: 0.7,
  activeProposalCount: 3,
  pendingApprovalCount: 1,
  scheduledInterviewCount: 2,
  expiringContractCount: 1,
  monthly: [],
  expiringContracts: [],
};
const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));
function repository(
  overrides: Partial<SalesKpiRepository> = {},
): SalesKpiRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    get: vi.fn(() => Promise.resolve(dashboard)),
    ...overrides,
  };
}
function app(salesKpi = repository()) {
  const instance = buildApp({ authentication, salesKpi });
  apps.push(instance);
  return instance;
}
describe('sales KPI API', () => {
  it('returns the access-scoped dashboard', async () => {
    const get = vi.fn(() => Promise.resolve(dashboard));
    const response = await app(repository({ get })).inject({
      method: 'GET',
      url: '/api/v1/sales-kpi?fromDate=2026-01-01&toDate=2026-08-14&contractExpiryDays=60',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(dashboard);
    expect(get).toHaveBeenCalledWith('valid', '2026-01-01', '2026-08-14', 60);
  });
  it('rejects unauthorized and invalid ranges', async () => {
    const forbidden = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: '/api/v1/sales-kpi?fromDate=2026-01-01&toDate=2026-08-14',
      headers: { authorization: 'Bearer valid' },
    });
    expect(forbidden.statusCode).toBe(403);
    const invalid = await app().inject({
      method: 'GET',
      url: '/api/v1/sales-kpi?fromDate=2026-08-14&toDate=2026-01-01',
      headers: { authorization: 'Bearer valid' },
    });
    expect(invalid.statusCode).toBe(400);
  });
});
