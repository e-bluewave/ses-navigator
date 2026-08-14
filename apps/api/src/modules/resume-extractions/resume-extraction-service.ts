import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export interface ResumeExtractionResult {
  profile: {
    summary: string | null;
    nearestStation: string | null;
    availableFrom: string | null;
  };
  careerHistories: Array<{
    projectName: string;
    clientName: string | null;
    roleName: string | null;
    industry: string | null;
    overview: string | null;
    responsibilities: string | null;
    achievements: string | null;
    startedOn: string | null;
    endedOn: string | null;
    evidence: string;
  }>;
  skills: Array<{
    name: string;
    experienceMonths: number | null;
    proficiencyLevel: string | null;
    lastUsedOn: string | null;
    evidence: string;
  }>;
  qualifications: Array<{
    name: string;
    issuer: string | null;
    acquiredOn: string | null;
    expiresOn: string | null;
    evidence: string;
  }>;
  preferences: {
    desiredRoles: string[];
    desiredLocations: string[];
    desiredContractTypes: string[];
    minimumRate: number | null;
    availableFrom: string | null;
  };
  uncertainties: string[];
  confidenceScore: number;
}
export interface ExtractionUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}
export interface ResumeExtractor {
  provider: string;
  modelName: string;
  promptVersion: string;
  extract(
    sourceText: string,
  ): Promise<{ result: ResumeExtractionResult; usage: ExtractionUsage }>;
}

export class OpenAIResumeExtractor implements ResumeExtractor {
  readonly provider = 'openai';
  readonly modelName = process.env.OPENAI_RESUME_MODEL ?? 'gpt-5.6-luna';
  readonly promptVersion = 'resume.extract.v1';

  async extract(sourceText: string) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${requiredEnv('OPENAI_API_KEY')}`,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: this.modelName,
        store: false,
        max_output_tokens: 8_000,
        input: [
          {
            role: 'system',
            content:
              'You extract Japanese IT engineer resumes into factual JSON. Never infer birth date, age, nationality, gender, or unsupported experience. Do not double-count overlapping periods. Put missing or contradictory facts in uncertainties. Evidence must be a short excerpt from the supplied text. If the text is unrelated, return empty arrays, null profile fields, low confidence, and explain why in uncertainties.',
          },
          { role: 'user', content: sourceText },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'resume_extraction',
            strict: true,
            schema: resumeSchema,
          },
        },
      }),
    });
    if (!response.ok)
      throw new ApiError(
        502,
        'openai_error',
        'Resume extraction service request failed',
      );
    const body = (await response.json()) as OpenAIResponse;
    if (body.status !== 'completed')
      throw new ApiError(
        502,
        'openai_incomplete',
        'Resume extraction did not complete',
      );
    const contents = body.output?.flatMap((item) => item.content ?? []) ?? [];
    const refusal = contents.find((item) => item.type === 'refusal');
    if (refusal)
      throw new ApiError(
        422,
        'openai_refusal',
        refusal.refusal ?? 'Resume extraction was refused',
      );
    const content = contents.find((item) => item.type === 'output_text');
    if (!content?.text)
      throw new ApiError(
        502,
        'openai_invalid_output',
        'Resume extraction returned no structured output',
      );
    let result: unknown;
    try {
      result = JSON.parse(content.text);
    } catch {
      throw new ApiError(
        502,
        'openai_invalid_output',
        'Resume extraction returned invalid JSON',
      );
    }
    assertResumeExtractionResult(result);
    return {
      result,
      usage: {
        inputTokens: body.usage?.input_tokens ?? null,
        outputTokens: body.usage?.output_tokens ?? null,
      },
    };
  }
}

type OpenAIResponse = {
  status?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};
export function assertResumeExtractionResult(
  value: unknown,
  statusCode = 502,
): asserts value is ResumeExtractionResult {
  const candidate = value as Partial<ResumeExtractionResult> | null;
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    !candidate.profile ||
    typeof candidate.profile !== 'object' ||
    !candidate.preferences ||
    typeof candidate.preferences !== 'object' ||
    !Array.isArray(candidate.careerHistories) ||
    !Array.isArray(candidate.skills) ||
    !Array.isArray(candidate.qualifications) ||
    !Array.isArray(candidate.uncertainties) ||
    typeof candidate.confidenceScore !== 'number' ||
    candidate.confidenceScore < 0 ||
    candidate.confidenceScore > 1
  )
    throw new ApiError(
      statusCode,
      statusCode === 400 ? 'invalid_request' : 'openai_invalid_output',
      'Resume extraction result is invalid',
    );
}
const nullableString = { type: ['string', 'null'] };
const resumeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    profile: {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: nullableString,
        nearestStation: nullableString,
        availableFrom: nullableString,
      },
      required: ['summary', 'nearestStation', 'availableFrom'],
    },
    careerHistories: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          projectName: { type: 'string' },
          clientName: nullableString,
          roleName: nullableString,
          industry: nullableString,
          overview: nullableString,
          responsibilities: nullableString,
          achievements: nullableString,
          startedOn: nullableString,
          endedOn: nullableString,
          evidence: { type: 'string' },
        },
        required: [
          'projectName',
          'clientName',
          'roleName',
          'industry',
          'overview',
          'responsibilities',
          'achievements',
          'startedOn',
          'endedOn',
          'evidence',
        ],
      },
    },
    skills: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          experienceMonths: { type: ['integer', 'null'] },
          proficiencyLevel: nullableString,
          lastUsedOn: nullableString,
          evidence: { type: 'string' },
        },
        required: [
          'name',
          'experienceMonths',
          'proficiencyLevel',
          'lastUsedOn',
          'evidence',
        ],
      },
    },
    qualifications: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          issuer: nullableString,
          acquiredOn: nullableString,
          expiresOn: nullableString,
          evidence: { type: 'string' },
        },
        required: ['name', 'issuer', 'acquiredOn', 'expiresOn', 'evidence'],
      },
    },
    preferences: {
      type: 'object',
      additionalProperties: false,
      properties: {
        desiredRoles: { type: 'array', items: { type: 'string' } },
        desiredLocations: { type: 'array', items: { type: 'string' } },
        desiredContractTypes: { type: 'array', items: { type: 'string' } },
        minimumRate: { type: ['number', 'null'] },
        availableFrom: nullableString,
      },
      required: [
        'desiredRoles',
        'desiredLocations',
        'desiredContractTypes',
        'minimumRate',
        'availableFrom',
      ],
    },
    uncertainties: { type: 'array', items: { type: 'string' } },
    confidenceScore: { type: 'number' },
  },
  required: [
    'profile',
    'careerHistories',
    'skills',
    'qualifications',
    'preferences',
    'uncertainties',
    'confidenceScore',
  ],
};
