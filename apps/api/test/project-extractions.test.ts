import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  ProjectExtraction,
  ProjectExtractionRepository,
} from '../src/modules/project-extractions/project-extraction-repository.js';
import {
  OpenAIProjectExtractor,
  type ProjectExtractionResult,
  type ProjectExtractor,
} from '../src/modules/project-extractions/project-extraction-service.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const extractionId = '22222222-2222-4222-8222-222222222222';
const aiExecutionId = '33333333-3333-4333-8333-333333333333';
const sourceText =
  '案件名：販売管理システム開発。必須：TypeScript、React。期間：2026年9月から。単価：70万円から80万円。勤務地：東京都、週3日リモート。';
const result: ProjectExtractionResult = {
  projectName: '販売管理システム開発',
  summary: '販売管理システムの開発案件',
  responsibilities: null,
  openings: null,
  startOn: '2026-09-01',
  endOn: null,
  requiredSkills: [
    { name: 'TypeScript', requiredMonths: null, evidence: '必須：TypeScript' },
  ],
  preferredSkills: [],
  commercial: {
    rateMin: 700000,
    rateMax: 800000,
    currencyCode: 'JPY',
    taxTreatment: null,
    settlementLowerHours: null,
    settlementUpperHours: null,
    paymentTermsDays: null,
    contractType: null,
    commercialFlow: null,
    restrictions: [],
  },
  workConditions: {
    workplace: '東京都',
    prefecture: '東京都',
    nearestStation: null,
    remoteType: 'hybrid',
    remoteDaysPerWeek: 3,
    workStartTime: null,
    workEndTime: null,
  },
  interviewCount: null,
  interviewScheduleText: null,
  companyCandidates: [],
  uncertainties: [],
  confidenceScore: 0.9,
};
const extraction: ProjectExtraction = {
  id: extractionId,
  projectId,
  aiExecutionId,
  status: 'completed',
  provider: 'openai',
  modelName: 'test-model',
  promptVersion: 'project.extract.v1',
  result,
  errorMessage: null,
  reviewNotes: null,
  reviewedAt: null,
  appliedAt: null,
  createdAt: '2026-08-14T00:00:00Z',
};
function repository(
  overrides: Partial<ProjectExtractionRepository> = {},
): ProjectExtractionRepository {
  return {
    canExecute: vi.fn(() => Promise.resolve(true)),
    canReview: vi.fn(() => Promise.resolve(true)),
    start: vi.fn(() => Promise.resolve({ extractionId, aiExecutionId })),
    complete: vi.fn(() => Promise.resolve()),
    fail: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve(extraction)),
    review: vi.fn(() => Promise.resolve({ ...extraction, status: 'applied' })),
    ...overrides,
  };
}
function extractor(
  overrides: Partial<ProjectExtractor> = {},
): ProjectExtractor {
  return {
    provider: 'openai',
    modelName: 'test-model',
    promptVersion: 'project.extract.v1',
    extract: vi.fn(() =>
      Promise.resolve({
        result,
        usage: { inputTokens: 100, outputTokens: 50 },
      }),
    ),
    ...overrides,
  };
}
const apps: ReturnType<typeof buildApp>[] = [];
function app(
  projectExtractions = repository(),
  projectExtractor = extractor(),
) {
  const value = buildApp({
    authentication: {
      authenticate: (accessToken) =>
        Promise.resolve({ id: 'user-1', accessToken }),
    },
    projectExtractions,
    projectExtractor,
  });
  apps.push(value);
  return value;
}
afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  await Promise.all(apps.splice(0).map((value) => value.close()));
});

describe('project extraction API', () => {
  it('uses strict Responses API output without provider-side storage', async () => {
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
                  { type: 'output_text', text: JSON.stringify(result) },
                ],
              },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
        ),
      ),
    );
    vi.stubGlobal('fetch', request);
    expect(await new OpenAIProjectExtractor().extract(sourceText)).toEqual({
      result,
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    const rawBody = request.mock.calls[0]![1]?.body;
    if (typeof rawBody !== 'string') throw new Error('body is not a string');
    expect(JSON.parse(rawBody)).toMatchObject({
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    });
  });

  it('extracts project information and records usage', async () => {
    const complete = vi.fn(() => Promise.resolve());
    const response = await app(repository({ complete })).inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/extractions`,
      headers: { authorization: 'Bearer valid' },
      payload: { sourceText, sourceTitle: '案件メール' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(extraction);
    expect(complete).toHaveBeenCalledWith(
      'valid',
      extractionId,
      aiExecutionId,
      result,
      100,
      50,
    );
  });

  it('records a failed extraction', async () => {
    const fail = vi.fn(() => Promise.resolve());
    const response = await app(
      repository({ fail }),
      extractor({ extract: vi.fn(() => Promise.reject(new Error('down'))) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/extractions`,
      headers: { authorization: 'Bearer valid' },
      payload: { sourceText },
    });
    expect(response.statusCode).toBe(502);
    expect(fail).toHaveBeenCalledWith(
      'valid',
      extractionId,
      aiExecutionId,
      'ai_error',
      'down',
    );
  });

  it('returns the latest extraction', async () => {
    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/extractions/latest`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(extraction);
  });

  it('requires review permission before applying', async () => {
    const response = await app(
      repository({ canReview: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/extractions/${extractionId}/review`,
      headers: { authorization: 'Bearer valid' },
      payload: { decision: 'approved', correctedResult: null, notes: null },
    });
    expect(response.statusCode).toBe(403);
  });
});
