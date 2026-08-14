import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  ProfitabilityDashboard,
  ProfitabilityRepository,
} from '../src/modules/profitability/profitability-repository.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';
const dashboard: ProfitabilityDashboard = {
  fromMonth: '2026-01-01',
  toMonth: '2026-08-01',
  currency: 'JPY',
  revenue: 1000000,
  purchaseCost: 600000,
  expenseCost: 50000,
  grossProfit: 350000,
  grossMarginRate: 35,
  cashIn: 800000,
  cashOut: 500000,
  receivableBalance: 200000,
  payableBalance: 100000,
  monthly: [],
};
const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));
function repository(
  overrides: Partial<ProfitabilityRepository> = {},
): ProfitabilityRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    get: vi.fn(() => Promise.resolve(dashboard)),
    ...overrides,
  };
}
function app(profitability = repository()) {
  const instance = buildApp({ authentication, profitability });
  apps.push(instance);
  return instance;
}
describe('profitability API', () => {
  it('returns a currency-safe monthly dashboard', async () => {
    const get = vi.fn(() => Promise.resolve(dashboard));
    const response = await app(repository({ get })).inject({
      method: 'GET',
      url: '/api/v1/profitability?fromMonth=2026-01-01&toMonth=2026-08-01&currency=JPY',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(dashboard);
    expect(get).toHaveBeenCalledWith(
      'valid',
      '2026-01-01',
      '2026-08-01',
      'JPY',
    );
  });
  it('rejects unauthorized, invalid, and overlong ranges', async () => {
    const forbidden = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: '/api/v1/profitability?fromMonth=2026-01-01&toMonth=2026-08-01',
      headers: { authorization: 'Bearer valid' },
    });
    expect(forbidden.statusCode).toBe(403);
    const invalid = await app().inject({
      method: 'GET',
      url: '/api/v1/profitability?fromMonth=2026-01-01&toMonth=2028-01-01',
      headers: { authorization: 'Bearer valid' },
    });
    expect(invalid.statusCode).toBe(400);
  });
});
