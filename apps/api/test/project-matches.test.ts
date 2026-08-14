import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { ProjectMatchRepository } from '../src/modules/project-matches/project-match-repository.js';
import {
  OpenAIProjectMatchExplainer,
  type ProjectMatchExplanation,
  type ProjectMatchExplainer,
  type ProjectMatchRun,
} from '../src/modules/project-matches/project-match-service.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const executionId = '33333333-3333-4333-8333-333333333333';
const candidateId = '44444444-4444-4444-8444-444444444444';
const match: ProjectMatchRun = {
  id: runId,
  projectId,
  projectRequirementVersionId: null,
  aiExecutionId: executionId,
  status: 'explaining',
  calculationVersion: 'match.v1',
  criteria: {
    projectName: '販売管理システム開発',
    skills: [{ name: 'TypeScript', requirementType: 'required' }],
  },
  candidateCount: 1,
  overallSummary: null,
  errorMessage: null,
  createdAt: '2026-08-14T00:00:00Z',
  completedAt: null,
  candidates: [
    {
      id: candidateId,
      engineerId: '55555555-5555-4555-8555-555555555555',
      resumeVersionId: null,
      rank: 1,
      overallScore: 87.5,
      requiredSkillScore: 100,
      preferredSkillScore: 50,
      availabilityScore: 100,
      rateScore: 100,
      locationScore: 50,
      requiredConditionsMet: true,
      confidenceScore: 0.85,
      matchedSkills: [{ name: 'TypeScript', experienceMonths: 48 }],
      missingSkills: [],
      warnings: ['勤務地希望が未確認です'],
      facts: {
        engineerManagementNo: 'EN-000001',
        engineerName: '山田 太郎',
      },
      explanation: null,
    },
  ],
};
const explanation: ProjectMatchExplanation = {
  overallSummary: '必須スキルと稼働条件が一致する候補です。',
  candidates: [
    {
      candidateId,
      matches: [{ text: '必須スキル一致', evidence: 'TypeScript 48か月' }],
      mismatches: [],
      missingInformation: [
        { text: '勤務地希望未確認', evidence: '希望勤務地データなし' },
      ],
      warnings: ['勤務地条件を確認してください'],
      recommendation: '提案前に勤務地希望を確認してください。',
      questions: ['東京都内への出社は可能ですか？'],
    },
  ],
};

function repository(
  overrides: Partial<ProjectMatchRepository> = {},
): ProjectMatchRepository {
  return {
    canExecute: vi.fn(() => Promise.resolve(true)),
    calculate: vi.fn(() => Promise.resolve(match)),
    complete: vi.fn(() =>
      Promise.resolve({
        ...match,
        status: 'completed' as const,
        overallSummary: explanation.overallSummary,
      }),
    ),
    fail: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve(match)),
    ...overrides,
  };
}

function explainer(
  overrides: Partial<ProjectMatchExplainer> = {},
): ProjectMatchExplainer {
  return {
    provider: 'openai',
    modelName: 'test-model',
    promptVersion: 'match.explain.v1',
    explain: vi.fn(() =>
      Promise.resolve({
        explanation,
        usage: { inputTokens: 200, outputTokens: 80 },
      }),
    ),
    ...overrides,
  };
}

const apps: ReturnType<typeof buildApp>[] = [];
function app(
  projectMatches = repository(),
  projectMatchExplainer = explainer(),
) {
  const value = buildApp({
    authentication: {
      authenticate: (accessToken) =>
        Promise.resolve({ id: 'user-1', accessToken }),
    },
    projectMatches,
    projectMatchExplainer,
  });
  apps.push(value);
  return value;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  await Promise.all(apps.splice(0).map((value) => value.close()));
});

describe('project-engineer match API', () => {
  it('uses strict structured output without score fields or provider storage', async () => {
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
                  { type: 'output_text', text: JSON.stringify(explanation) },
                ],
              },
            ],
            usage: { input_tokens: 200, output_tokens: 80 },
          }),
        ),
      ),
    );
    vi.stubGlobal('fetch', request);
    expect(await new OpenAIProjectMatchExplainer().explain(match)).toEqual({
      explanation,
      usage: { inputTokens: 200, outputTokens: 80 },
    });
    const rawBody = request.mock.calls[0]![1]?.body;
    if (typeof rawBody !== 'string') throw new Error('body is not a string');
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    expect(body).toMatchObject({
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    });
    const outputProperties = (
      body.text as {
        format: {
          schema: {
            properties: {
              candidates: { items: { properties: Record<string, unknown> } };
            };
          };
        };
      }
    ).format.schema.properties.candidates.items.properties;
    expect(outputProperties).not.toHaveProperty('overallScore');
    expect(outputProperties).not.toHaveProperty('rank');
    expect(JSON.stringify(body)).toContain(candidateId);
  });

  it('calculates deterministic matches and stores AI explanations', async () => {
    const complete = vi.fn(() =>
      Promise.resolve({
        ...match,
        status: 'completed' as const,
        overallSummary: explanation.overallSummary,
      }),
    );
    const response = await app(repository({ complete })).inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/ai/match-engineers`,
      headers: { authorization: 'Bearer valid' },
      payload: { limit: 5 },
    });
    expect(response.statusCode).toBe(201);
    expect(complete).toHaveBeenCalledWith(
      'valid',
      runId,
      executionId,
      explanation,
      200,
      80,
    );
  });

  it('records an explanation failure without changing deterministic scores', async () => {
    const fail = vi.fn(() => Promise.resolve());
    const response = await app(
      repository({ fail }),
      explainer({ explain: vi.fn(() => Promise.reject(new Error('down'))) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/ai/match-engineers`,
      headers: { authorization: 'Bearer valid' },
      payload: { limit: 3 },
    });
    expect(response.statusCode).toBe(502);
    expect(fail).toHaveBeenCalledWith(
      'valid',
      runId,
      executionId,
      'ai_error',
      'down',
    );
  });

  it('returns the latest saved match run', async () => {
    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/ai/matches/latest`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(match);
  });

  it('requires ai.execute permission', async () => {
    const response = await app(
      repository({ canExecute: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/ai/match-engineers`,
      headers: { authorization: 'Bearer valid' },
      payload: { limit: 5 },
    });
    expect(response.statusCode).toBe(403);
  });
});
