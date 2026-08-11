import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';
import type {
  Proposal,
  ProposalRepository,
} from '../src/modules/proposals/proposal-repository.js';

const proposal: Proposal = {
  id: '11111111-1111-4111-8111-111111111111',
  managementNo: 'PR-000001',
  projectPositionId: '22222222-2222-4222-8222-222222222222',
  engineerId: '33333333-3333-4333-8333-333333333333',
  destinationCompanyId: '44444444-4444-4444-8444-444444444444',
  destinationContactId: null,
  resumeVersionId: null,
  requirementVersionId: null,
  proposedUnitPrice: 800000,
  currencyCode: 'JPY',
  status: 'sent',
  proposedStartDate: '2026-09-01',
  validityDate: '2026-08-31',
  updatedAt: '2026-08-11T00:00:00Z',
  rowVersion: 2,
};
const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));
function repository(
  overrides: Partial<ProposalRepository> = {},
): ProposalRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() => Promise.resolve({ items: [proposal], nextCursor: null })),
    findById: vi.fn(() => Promise.resolve(proposal)),
    ...overrides,
  };
}
function app(proposals = repository()) {
  const instance = buildApp({ authentication, proposals });
  apps.push(instance);
  return instance;
}

describe('proposal read API', () => {
  it('lists RLS-visible proposals', async () => {
    const response = await app().inject({
      method: 'GET',
      url: '/api/v1/proposals?status=sent&limit=20',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [proposal],
      page: { limit: 20, nextCursor: null },
    });
  });
  it('requires proposal.read', async () => {
    const response = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: '/api/v1/proposals',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(403);
  });
  it('returns proposal detail', async () => {
    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/proposals/${proposal.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(proposal);
  });
  it('returns 404 when RLS hides a proposal', async () => {
    const response = await app(
      repository({ findById: vi.fn(() => Promise.resolve(null)) }),
    ).inject({
      method: 'GET',
      url: `/api/v1/proposals/${proposal.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(404);
  });
});
