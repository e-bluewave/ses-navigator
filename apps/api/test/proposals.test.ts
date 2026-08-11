import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';
import type {
  Proposal,
  ProposalInput,
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
const input: ProposalInput = {
  managementNo: proposal.managementNo,
  projectPositionId: proposal.projectPositionId,
  engineerId: proposal.engineerId,
  destinationCompanyId: proposal.destinationCompanyId,
  destinationContactId: null,
  resumeVersionId: null,
  requirementVersionId: null,
  proposedUnitPrice: proposal.proposedUnitPrice,
  currencyCode: 'JPY',
  proposedStartDate: proposal.proposedStartDate,
  validityDate: proposal.validityDate,
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));
function repository(
  overrides: Partial<ProposalRepository> = {},
): ProposalRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    canManage: vi.fn(() => Promise.resolve(true)),
    canSend: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() => Promise.resolve({ items: [proposal], nextCursor: null })),
    findById: vi.fn(() => Promise.resolve(proposal)),
    create: vi.fn(() => Promise.resolve({ ...proposal, status: 'draft' })),
    update: vi.fn(() => Promise.resolve({ ...proposal, status: 'draft' })),
    transitionStatus: vi.fn(() => Promise.resolve(proposal)),
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

describe('proposal write API', () => {
  it('creates a draft proposal through the limited repository path', async () => {
    const create = vi.fn(() =>
      Promise.resolve({ ...proposal, status: 'draft', rowVersion: 1 }),
    );
    const response = await app(repository({ create })).inject({
      method: 'POST',
      url: '/api/v1/proposals',
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers.etag).toBe('"1"');
    expect(create).toHaveBeenCalledWith('valid', input, expect.any(String));
  });

  it('requires proposal.manage to create a proposal', async () => {
    const response = await app(
      repository({ canManage: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: '/api/v1/proposals',
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(response.statusCode).toBe(403);
  });

  it('uses If-Match when updating a draft', async () => {
    const update = vi.fn(() =>
      Promise.resolve({ ...proposal, status: 'draft', rowVersion: 3 }),
    );
    const response = await app(repository({ update })).inject({
      method: 'PUT',
      url: `/api/v1/proposals/${proposal.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: input,
    });
    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(
      'valid',
      proposal.id,
      2,
      input,
      expect.any(String),
    );
  });

  it('requires proposal.send for the sent transition', async () => {
    const response = await app(
      repository({ canSend: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposal.id}/status`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: { status: 'sent' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('records a reason for terminal status transitions', async () => {
    const transitionStatus = vi.fn(() =>
      Promise.resolve({ ...proposal, status: 'lost', rowVersion: 3 }),
    );
    const response = await app(repository({ transitionStatus })).inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposal.id}/status`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: { status: 'lost', reason: 'Client selected another candidate' },
    });
    expect(response.statusCode).toBe(200);
    expect(transitionStatus).toHaveBeenCalledWith(
      'valid',
      proposal.id,
      2,
      'lost',
      'Client selected another candidate',
      expect.any(String),
    );
  });
});
