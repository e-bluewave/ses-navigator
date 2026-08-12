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
  scheduleCandidates: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      startAt: '2026-08-19T01:00:00Z',
      endAt: '2026-08-19T02:00:00Z',
      candidateOrder: 1,
    },
  ],
  participants: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      participantType: 'engineer',
      engineerId: '44444444-4444-4444-8444-444444444444',
      userId: null,
      companyContactId: null,
      displayName: '青波 太郎',
      email: null,
      roleLabel: '候補者',
      attendanceStatus: 'attended',
    },
  ],
  feedback: [],
  outcome: null,
  statusHistory: [],
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
    canManage: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() =>
      Promise.resolve({ items: [interview], nextCursor: null }),
    ),
    findById: vi.fn(() => Promise.resolve(interview)),
    create: vi.fn(() => Promise.resolve(interview)),
    update: vi.fn(() => Promise.resolve(interview)),
    saveResult: vi.fn(() => Promise.resolve(interview)),
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

describe('interview write API', () => {
  const input = {
    proposalId: interview.proposalId,
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
        startAt: '2026-08-19T01:00:00Z',
        endAt: '2026-08-19T02:00:00Z',
      },
    ],
  };

  it('creates an interview schedule through the limited repository path', async () => {
    const create = vi.fn(() => Promise.resolve(interview));
    const response = await app(repository({ create })).inject({
      method: 'POST',
      url: '/api/v1/interviews',
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers.etag).toBe('"2"');
    expect(create).toHaveBeenCalledWith(
      'valid',
      {
        ...input,
        scheduledStartAt: '2026-08-20T01:00:00.000Z',
        scheduledEndAt: '2026-08-20T02:00:00.000Z',
        scheduleCandidates: [
          {
            startAt: '2026-08-19T01:00:00.000Z',
            endAt: '2026-08-19T02:00:00.000Z',
          },
        ],
      },
      expect.any(String),
    );
  });

  it('requires interview.manage to create an interview', async () => {
    const response = await app(
      repository({ canManage: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: '/api/v1/interviews',
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(response.statusCode).toBe(403);
  });

  it('uses If-Match when updating an interview schedule', async () => {
    const update = vi.fn(() =>
      Promise.resolve({ ...interview, rowVersion: 3 }),
    );
    const response = await app(repository({ update })).inject({
      method: 'PUT',
      url: `/api/v1/interviews/${interview.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: input,
    });
    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(
      'valid',
      interview.id,
      2,
      {
        ...input,
        scheduledStartAt: '2026-08-20T01:00:00.000Z',
        scheduledEndAt: '2026-08-20T02:00:00.000Z',
        scheduleCandidates: [
          {
            startAt: '2026-08-19T01:00:00.000Z',
            endAt: '2026-08-19T02:00:00.000Z',
          },
        ],
      },
      expect.any(String),
    );
  });

  it('rejects scheduled interviews without confirmed times', async () => {
    const response = await app().inject({
      method: 'POST',
      url: '/api/v1/interviews',
      headers: { authorization: 'Bearer valid' },
      payload: { ...input, scheduledStartAt: null, scheduledEndAt: null },
    });
    expect(response.statusCode).toBe(400);
  });

  it('saves participants, outcome, feedback, and completed status', async () => {
    const completed = {
      ...interview,
      status: 'completed' as const,
      rowVersion: 3,
    };
    const saveResult = vi.fn(() => Promise.resolve(completed));
    const payload = {
      status: 'completed',
      reason: '一次面談を実施',
      participants: [
        {
          participantType: 'engineer',
          engineerId: interview.engineerId,
          userId: null,
          companyContactId: null,
          displayName: '青波 太郎',
          email: null,
          roleLabel: '候補者',
          attendanceStatus: 'attended',
        },
      ],
      feedback: {
        evaluationType: 'internal',
        overallRating: 4,
        technicalRating: 4,
        communicationRating: 5,
        recommendation: 'yes',
        comments: '次へ進めたい',
      },
      outcome: {
        outcome: 'pass',
        decidedAt: '2026-08-20T02:00:00Z',
        decisionSource: 'customer',
        reason: '評価良好',
        nextAction: '次回面談を調整',
        nextActionDueAt: '2026-08-21T00:00:00Z',
      },
    };
    const response = await app(repository({ saveResult })).inject({
      method: 'POST',
      url: `/api/v1/interviews/${interview.id}/result`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).toBe('"3"');
    expect(saveResult).toHaveBeenCalledWith(
      'valid',
      interview.id,
      2,
      {
        ...payload,
        outcome: {
          ...payload.outcome,
          decidedAt: '2026-08-20T02:00:00.000Z',
          nextActionDueAt: '2026-08-21T00:00:00.000Z',
        },
      },
      expect.any(String),
    );
  });

  it('requires a reason when cancelling an interview', async () => {
    const response = await app().inject({
      method: 'POST',
      url: `/api/v1/interviews/${interview.id}/result`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: {
        status: 'cancelled',
        reason: null,
        participants: [],
        feedback: null,
        outcome: null,
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('requires interview.manage to save an interview result', async () => {
    const response = await app(
      repository({ canManage: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/interviews/${interview.id}/result`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: {
        status: 'cancelled',
        reason: '顧客都合',
        participants: [],
        feedback: null,
        outcome: null,
      },
    });
    expect(response.statusCode).toBe(403);
  });
});
