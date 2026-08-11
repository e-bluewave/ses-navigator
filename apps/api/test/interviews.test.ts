import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';
import type {
  Interview,
  InterviewRepository,
} from '../src/modules/interviews/interview-repository.js';

const interview: Interview = {
  id: '11111111-1111-4111-8111-111111111111',
  proposalId: '22222222-2222-4222-8222-222222222222',
  proposalManagementNo: 'PR-000001',
  projectPositionId: '33333333-3333-4333-8333-333333333333',
  engineerId: '44444444-4444-4444-8444-444444444444',
  interviewRound: 1,
  interviewType: 'online',
  status: 'scheduled',
  scheduledStartAt: '2026-08-20T01:00:00Z',
  scheduledEndAt: '2026-08-20T02:00:00Z',
  locationText: null,
  meetingUrl: 'https://meet.example.com/interview',
  notes: '経歴書を確認する',
  updatedAt: '2026-08-11T00:00:00Z',
  rowVersion: 2,
};
const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));
function repository(
  overrides: Partial<InterviewRepository> = {},
): InterviewRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() =>
      Promise.resolve({ items: [interview], nextCursor: null }),
    ),
    findById: vi.fn(() => Promise.resolve(interview)),
    ...overrides,
  };
}
function app(interviews = repository()) {
  const instance = buildApp({ authentication, interviews });
  apps.push(instance);
  return instance;
}

describe('interview read API', () => {
  it('lists RLS-visible interviews', async () => {
    const list = vi.fn(() =>
      Promise.resolve({ items: [interview], nextCursor: null }),
    );
    const response = await app(repository({ list })).inject({
      method: 'GET',
      url: '/api/v1/interviews?q=PR-000001&status=scheduled&limit=20',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [interview],
      page: { limit: 20, nextCursor: null },
    });
    expect(list).toHaveBeenCalledWith('valid', {
      limit: 20,
      query: 'PR-000001',
      status: 'scheduled',
    });
  });

  it('requires interview.read', async () => {
    const response = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: '/api/v1/interviews',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('returns interview detail', async () => {
    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/interviews/${interview.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(interview);
  });

  it('returns 404 when RLS hides an interview', async () => {
    const response = await app(
      repository({ findById: vi.fn(() => Promise.resolve(null)) }),
    ).inject({
      method: 'GET',
      url: `/api/v1/interviews/${interview.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('rejects an invalid status', async () => {
    const response = await app().inject({
      method: 'GET',
      url: '/api/v1/interviews?status=unknown',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(400);
  });
});
