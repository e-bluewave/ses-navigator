import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  ResumeExtraction,
  ResumeExtractionRepository,
} from '../src/modules/resume-extractions/resume-extraction-repository.js';
import type {
  ResumeExtractionResult,
  ResumeExtractor,
} from '../src/modules/resume-extractions/resume-extraction-service.js';
import { OpenAIResumeExtractor } from '../src/modules/resume-extractions/resume-extraction-service.js';

const engineerId = '11111111-1111-4111-8111-111111111111';
const versionId = '22222222-2222-4222-8222-222222222222';
const extractionId = '33333333-3333-4333-8333-333333333333';
const aiExecutionId = '44444444-4444-4444-8444-444444444444';
const sourceText =
  '職務経歴書。TypeScriptを用いた業務システム開発を2023年から担当しました。設計、実装、テスト、運用改善を担当しました。';
const result: ResumeExtractionResult = {
  profile: {
    summary: 'TypeScriptエンジニア',
    nearestStation: null,
    availableFrom: null,
  },
  careerHistories: [],
  skills: [
    {
      name: 'TypeScript',
      experienceMonths: 36,
      proficiencyLevel: '実務',
      lastUsedOn: null,
      evidence: 'TypeScriptを用いた業務システム開発',
    },
  ],
  qualifications: [],
  preferences: {
    desiredRoles: [],
    desiredLocations: [],
    desiredContractTypes: [],
    minimumRate: null,
    availableFrom: null,
  },
  uncertainties: [],
  confidenceScore: 0.9,
};
const extraction: ResumeExtraction = {
  id: extractionId,
  resumeVersionId: versionId,
  aiExecutionId,
  status: 'completed',
  provider: 'openai',
  modelName: 'test-model',
  promptVersion: 'resume.extract.v1',
  result,
  errorMessage: null,
  reviewNotes: null,
  reviewedAt: null,
  createdAt: '2026-08-14T00:00:00Z',
};
function repository(
  overrides: Partial<ResumeExtractionRepository> = {},
): ResumeExtractionRepository {
  return {
    canExecute: vi.fn(() => Promise.resolve(true)),
    canReview: vi.fn(() => Promise.resolve(true)),
    start: vi.fn(() => Promise.resolve({ extractionId, aiExecutionId })),
    complete: vi.fn(() => Promise.resolve()),
    fail: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve(extraction)),
    review: vi.fn(() => Promise.resolve({ ...extraction, status: 'approved' })),
    ...overrides,
  };
}
function extractor(overrides: Partial<ResumeExtractor> = {}): ResumeExtractor {
  return {
    provider: 'openai',
    modelName: 'test-model',
    promptVersion: 'resume.extract.v1',
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
function app(resumeExtractions = repository(), resumeExtractor = extractor()) {
  const value = buildApp({
    authentication: {
      authenticate: (accessToken) =>
        Promise.resolve({ id: 'user-1', accessToken }),
    },
    resumeExtractions,
    resumeExtractor,
  });
  apps.push(value);
  return value;
}
afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  await Promise.all(apps.splice(0).map((value) => value.close()));
});

describe('resume extraction API', () => {
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
    expect(await new OpenAIResumeExtractor().extract(sourceText)).toEqual({
      result,
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    const rawBody = request.mock.calls[0]![1]?.body;
    expect(typeof rawBody).toBe('string');
    if (typeof rawBody !== 'string') throw new Error('body is not a string');
    const body = JSON.parse(rawBody) as {
      store: boolean;
      text: { format: { strict: boolean; type: string } };
    };
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({
      type: 'json_schema',
      strict: true,
    });
  });

  it('extracts a resume and records its token usage', async () => {
    const complete = vi.fn(() => Promise.resolve());
    const response = await app(repository({ complete })).inject({
      method: 'POST',
      url: `/api/v1/engineers/${engineerId}/resume-versions/${versionId}/extractions`,
      headers: { authorization: 'Bearer valid' },
      payload: { sourceText },
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
      expect.any(String),
    );
  });

  it('records a failed extraction', async () => {
    const fail = vi.fn(() => Promise.resolve());
    const response = await app(
      repository({ fail }),
      extractor({ extract: vi.fn(() => Promise.reject(new Error('down'))) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/engineers/${engineerId}/resume-versions/${versionId}/extractions`,
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
      url: `/api/v1/engineers/${engineerId}/resume-versions/${versionId}/extractions/latest`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(extraction);
  });

  it('requires review permission before approving', async () => {
    const response = await app(
      repository({ canReview: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/engineers/${engineerId}/resume-versions/${versionId}/extractions/${extractionId}/review`,
      headers: { authorization: 'Bearer valid' },
      payload: { decision: 'approved', correctedResult: null, notes: null },
    });
    expect(response.statusCode).toBe(403);
  });
});
