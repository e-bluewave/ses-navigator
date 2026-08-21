import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  InterviewSummary,
  InterviewSummaryRepository,
} from '../src/modules/interview-summaries/interview-summary-repository.js';
import {
  OpenAIInterviewSummarizer,
  type InterviewSummarizer,
  type InterviewSummaryGeneration,
} from '../src/modules/interview-summaries/interview-summary-service.js';

const interviewId = '11111111-1111-4111-8111-111111111111';
const proposalId = '22222222-2222-4222-8222-222222222222';
const executionId = '33333333-3333-4333-8333-333333333333';
const generation: InterviewSummaryGeneration = {
  summary: '技術面の評価は良好で、参画時期の確認が必要です。',
  facts: ['顧客はTypeScript経験について質問した。'],
  evaluations: [
    {
      source: '社内評価',
      text: '技術面を高く評価した。',
      evidence: 'technicalRating=5',
    },
  ],
  concerns: [
    {
      text: '参画開始日が未確認である。',
      evidence: '面談メモに開始日の確定記載がない。',
      severity: 'medium',
    },
  ],
  actionItems: [
    {
      title: '参画開始日を確認する',
      description: '顧客と技術者へ開始可能日を確認する。',
      dueAt: '2026-08-25T09:00:00+09:00',
      priority: 'high',
      evidence: '参画開始日が未確認。',
    },
  ],
  openQuestions: ['参画開始日はいつか。'],
  statusSuggestions: [
    {
      status: 'offered',
      reason: '面談結果がpassである。',
      evidence: 'outcome=pass',
    },
  ],
  safetyWarnings: [],
};
const summary: InterviewSummary = {
  aiExecutionId: executionId,
  interviewId,
  proposalId,
  interviewRowVersion: 3,
  status: 'review_required',
  provider: 'openai',
  modelName: 'test-model',
  promptVersion: 'interview.summarize.v1',
  errorCode: null,
  errorMessage: null,
  result: generation,
  originalResult: generation,
  reviewStatus: 'pending',
  reviewComment: null,
  reviewedAt: null,
  reviewRowVersion: 1,
  generatedTaskIds: [],
  requestedAt: '2026-08-22T00:00:00Z',
  completedAt: '2026-08-22T00:00:10Z',
  rowVersion: 2,
};

function repository(
  overrides: Partial<InterviewSummaryRepository> = {},
): InterviewSummaryRepository {
  return {
    canExecute: vi.fn(() => Promise.resolve(true)),
    canReview: vi.fn(() => Promise.resolve(true)),
    canAiRead: vi.fn(() => Promise.resolve(true)),
    canInterviewRead: vi.fn(() => Promise.resolve(true)),
    canInterviewManage: vi.fn(() => Promise.resolve(true)),
    canTaskManage: vi.fn(() => Promise.resolve(true)),
    start: vi.fn(() =>
      Promise.resolve({
        summary: {
          ...summary,
          status: 'running',
          result: null,
          originalResult: null,
          reviewStatus: null,
          reviewRowVersion: null,
          completedAt: null,
          rowVersion: 1,
        },
        summaryInput: {
          interview: { id: interviewId, notes: '面談メモ' },
          proposal: { id: proposalId, status: 'interviewing' },
          participants: [],
          feedback: [],
          outcome: { outcome: 'pass' },
          settings: {},
        },
      }),
    ),
    complete: vi.fn(() => Promise.resolve(summary)),
    fail: vi.fn(() => Promise.resolve()),
    review: vi.fn(() =>
      Promise.resolve({
        ...summary,
        status: 'succeeded',
        reviewStatus: 'approved',
        reviewRowVersion: 2,
        generatedTaskIds: ['44444444-4444-4444-8444-444444444444'],
        rowVersion: 3,
      }),
    ),
    get: vi.fn(() => Promise.resolve(summary)),
    ...overrides,
  };
}

function summarizer(
  overrides: Partial<InterviewSummarizer> = {},
): InterviewSummarizer {
  return {
    provider: 'openai',
    modelName: 'test-model',
    promptVersion: 'interview.summarize.v1',
    summarize: vi.fn(() =>
      Promise.resolve({
        result: generation,
        usage: { inputTokens: 400, outputTokens: 180 },
      }),
    ),
    ...overrides,
  };
}

const apps: ReturnType<typeof buildApp>[] = [];
function app(
  interviewSummaries = repository(),
  interviewSummarizer = summarizer(),
) {
  const value = buildApp({
    authentication: {
      authenticate: (accessToken) =>
        Promise.resolve({ id: 'user-1', accessToken }),
    },
    interviewSummaries,
    interviewSummarizer,
  });
  apps.push(value);
  return value;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  await Promise.all(apps.splice(0).map((value) => value.close()));
});

describe('interview summary API', () => {
  it('uses strict structured output and disables provider storage', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const request = vi.fn<
      (input: string | URL, init?: RequestInit) => Promise<Response>
    >(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status: 'completed',
            output: [
              {
                content: [
                  { type: 'output_text', text: JSON.stringify(generation) },
                ],
              },
            ],
            usage: { input_tokens: 400, output_tokens: 180 },
          }),
        ),
      ),
    );
    vi.stubGlobal('fetch', request);
    const result = await new OpenAIInterviewSummarizer().summarize({
      interview: { id: interviewId },
      proposal: { id: proposalId },
      participants: [],
      feedback: [],
      outcome: null,
      settings: {},
    });
    expect(result).toEqual({
      result: generation,
      usage: { inputTokens: 400, outputTokens: 180 },
    });
    const rawBody = request.mock.calls[0]![1]?.body;
    if (typeof rawBody !== 'string') throw new Error('body is not a string');
    expect(JSON.parse(rawBody)).toMatchObject({
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    });
  });

  it('generates a review-required summary without creating tasks', async () => {
    const complete = vi.fn(() => Promise.resolve(summary));
    const response = await app(repository({ complete })).inject({
      method: 'POST',
      url: `/api/v1/interviews/${interviewId}/ai/summary`,
      headers: { authorization: 'Bearer valid' },
      payload: { additionalInstructions: '簡潔にまとめる' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: 'review_required',
      generatedTaskIds: [],
    });
    expect(complete).toHaveBeenCalledWith(
      'valid',
      interviewId,
      executionId,
      generation,
      400,
      180,
      expect.any(String),
    );
  });

  it('records a failed generation and returns a gateway error', async () => {
    const fail = vi.fn(() => Promise.resolve());
    const response = await app(
      repository({ fail }),
      summarizer({
        summarize: vi.fn(() => Promise.reject(new Error('down'))),
      }),
    ).inject({
      method: 'POST',
      url: `/api/v1/interviews/${interviewId}/ai/summary`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(502);
    expect(fail).toHaveBeenCalledWith(
      'valid',
      interviewId,
      executionId,
      'ai_error',
      'down',
      expect.any(String),
    );
  });

  it('approves edited content and only selected task candidates', async () => {
    const review = vi.fn(() =>
      Promise.resolve({
        ...summary,
        status: 'succeeded',
        reviewStatus: 'partially_approved',
        generatedTaskIds: ['44444444-4444-4444-8444-444444444444'],
      }),
    );
    const edited = { ...generation, summary: '確認済み要約' };
    const response = await app(repository({ review })).inject({
      method: 'POST',
      url: `/api/v1/interviews/${interviewId}/ai/summary/${executionId}/review`,
      headers: { authorization: 'Bearer valid', 'if-match': '1' },
      payload: {
        decision: 'approve',
        editedResult: edited,
        acceptedActionItemIndexes: [1],
        reviewComment: '確認済み',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      reviewStatus: 'partially_approved',
      generatedTaskIds: ['44444444-4444-4444-8444-444444444444'],
    });
    expect(review).toHaveBeenCalledWith(
      'valid',
      interviewId,
      executionId,
      1,
      'approve',
      edited,
      [1],
      '確認済み',
      expect.any(String),
    );
  });

  it('requires a rejection reason and never accepts tasks on rejection', async () => {
    const response = await app().inject({
      method: 'POST',
      url: `/api/v1/interviews/${interviewId}/ai/summary/${executionId}/review`,
      headers: { authorization: 'Bearer valid', 'if-match': '1' },
      payload: { decision: 'reject', acceptedActionItemIndexes: [1] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('requires task.manage only when creating selected tasks', async () => {
    const response = await app(
      repository({ canTaskManage: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/interviews/${interviewId}/ai/summary/${executionId}/review`,
      headers: { authorization: 'Bearer valid', 'if-match': '1' },
      payload: {
        decision: 'approve',
        acceptedActionItemIndexes: [1],
      },
    });
    expect(response.statusCode).toBe(403);
  });
});
