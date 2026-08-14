import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export interface ProjectExtractionResult {
  projectName: string | null;
  summary: string | null;
  responsibilities: string | null;
  openings: number | null;
  startOn: string | null;
  endOn: string | null;
  requiredSkills: Array<{
    name: string;
    requiredMonths: number | null;
    evidence: string;
  }>;
  preferredSkills: Array<{
    name: string;
    requiredMonths: number | null;
    evidence: string;
  }>;
  commercial: {
    rateMin: number | null;
    rateMax: number | null;
    currencyCode: string;
    taxTreatment: string | null;
    settlementLowerHours: number | null;
    settlementUpperHours: number | null;
    paymentTermsDays: number | null;
    contractType: string | null;
    commercialFlow: string | null;
    restrictions: string[];
  };
  workConditions: {
    workplace: string | null;
    prefecture: string | null;
    nearestStation: string | null;
    remoteType: 'onsite' | 'hybrid' | 'remote' | 'negotiable' | null;
    remoteDaysPerWeek: number | null;
    workStartTime: string | null;
    workEndTime: string | null;
  };
  interviewCount: number | null;
  interviewScheduleText: string | null;
  companyCandidates: Array<{
    name: string;
    relationType: string | null;
    contactName: string | null;
    evidence: string;
  }>;
  uncertainties: string[];
  confidenceScore: number;
}
export interface ProjectExtractor {
  provider: string;
  modelName: string;
  promptVersion: string;
  extract(sourceText: string): Promise<{
    result: ProjectExtractionResult;
    usage: { inputTokens: number | null; outputTokens: number | null };
  }>;
}

export class OpenAIProjectExtractor implements ProjectExtractor {
  readonly provider = 'openai';
  readonly modelName =
    process.env.OPENAI_PROJECT_MODEL ??
    process.env.OPENAI_RESUME_MODEL ??
    'gpt-5.6-luna';
  readonly promptVersion = 'project.extract.v1';

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
              'Extract Japanese SES project information into factual JSON. Keep required and preferred skills separate. Never invent a rate for vague phrases such as skill-dependent or negotiable. Preserve tax treatment, settlement ranges, commercial flow, and restrictions separately. Do not infer company identity, contract terms, dates, or commercial-chain order. If a relative date lacks a reliable reference date, leave it null and add an uncertainty. Evidence must be a short excerpt from the supplied text. If the text is unrelated, use nulls and empty arrays, set low confidence, and explain why in uncertainties.',
          },
          { role: 'user', content: sourceText },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'project_extraction',
            strict: true,
            schema: projectSchema,
          },
        },
      }),
    });
    if (!response.ok)
      throw new ApiError(
        502,
        'openai_error',
        'Project extraction service request failed',
      );
    const body = (await response.json()) as OpenAIResponse;
    if (body.status !== 'completed')
      throw new ApiError(
        502,
        'openai_incomplete',
        'Project extraction did not complete',
      );
    const contents = body.output?.flatMap((item) => item.content ?? []) ?? [];
    const refusal = contents.find((item) => item.type === 'refusal');
    if (refusal)
      throw new ApiError(
        422,
        'openai_refusal',
        refusal.refusal ?? 'Project extraction was refused',
      );
    const text = contents.find((item) => item.type === 'output_text')?.text;
    if (!text)
      throw new ApiError(
        502,
        'openai_invalid_output',
        'Project extraction returned no structured output',
      );
    let result: unknown;
    try {
      result = JSON.parse(text);
    } catch {
      throw new ApiError(
        502,
        'openai_invalid_output',
        'Project extraction returned invalid JSON',
      );
    }
    assertProjectExtractionResult(result);
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
export function assertProjectExtractionResult(
  value: unknown,
  statusCode = 502,
): asserts value is ProjectExtractionResult {
  const x = value as Partial<ProjectExtractionResult> | null;
  if (
    !x ||
    typeof x !== 'object' ||
    !Array.isArray(x.requiredSkills) ||
    !Array.isArray(x.preferredSkills) ||
    !x.commercial ||
    typeof x.commercial !== 'object' ||
    !Array.isArray(x.commercial.restrictions) ||
    !x.workConditions ||
    typeof x.workConditions !== 'object' ||
    !Array.isArray(x.companyCandidates) ||
    !Array.isArray(x.uncertainties) ||
    typeof x.confidenceScore !== 'number' ||
    x.confidenceScore < 0 ||
    x.confidenceScore > 1 ||
    !validDate(x.startOn) ||
    !validDate(x.endOn) ||
    (x.startOn != null && x.endOn != null && x.endOn < x.startOn) ||
    !validRange(x.commercial.rateMin, x.commercial.rateMax) ||
    !validRange(
      x.commercial.settlementLowerHours,
      x.commercial.settlementUpperHours,
    ) ||
    (x.workConditions.remoteDaysPerWeek != null &&
      (x.workConditions.remoteDaysPerWeek < 0 ||
        x.workConditions.remoteDaysPerWeek > 7))
  )
    throw new ApiError(
      statusCode,
      statusCode === 400 ? 'invalid_request' : 'openai_invalid_output',
      'Project extraction result is invalid',
    );
}
function validDate(value: unknown) {
  return (
    value == null ||
    (typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
  );
}
function validRange(
  min: number | null | undefined,
  max: number | null | undefined,
) {
  return min == null || max == null || min <= max;
}

const nullableString = { type: ['string', 'null'] };
const nullableNumber = { type: ['number', 'null'] };
const skillSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    requiredMonths: { type: ['integer', 'null'] },
    evidence: { type: 'string' },
  },
  required: ['name', 'requiredMonths', 'evidence'],
};
const projectSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectName: nullableString,
    summary: nullableString,
    responsibilities: nullableString,
    openings: { type: ['integer', 'null'] },
    startOn: nullableString,
    endOn: nullableString,
    requiredSkills: { type: 'array', items: skillSchema },
    preferredSkills: { type: 'array', items: skillSchema },
    commercial: {
      type: 'object',
      additionalProperties: false,
      properties: {
        rateMin: nullableNumber,
        rateMax: nullableNumber,
        currencyCode: { type: 'string' },
        taxTreatment: nullableString,
        settlementLowerHours: nullableNumber,
        settlementUpperHours: nullableNumber,
        paymentTermsDays: { type: ['integer', 'null'] },
        contractType: nullableString,
        commercialFlow: nullableString,
        restrictions: { type: 'array', items: { type: 'string' } },
      },
      required: [
        'rateMin',
        'rateMax',
        'currencyCode',
        'taxTreatment',
        'settlementLowerHours',
        'settlementUpperHours',
        'paymentTermsDays',
        'contractType',
        'commercialFlow',
        'restrictions',
      ],
    },
    workConditions: {
      type: 'object',
      additionalProperties: false,
      properties: {
        workplace: nullableString,
        prefecture: nullableString,
        nearestStation: nullableString,
        remoteType: {
          type: ['string', 'null'],
          enum: ['onsite', 'hybrid', 'remote', 'negotiable', null],
        },
        remoteDaysPerWeek: { type: ['integer', 'null'] },
        workStartTime: nullableString,
        workEndTime: nullableString,
      },
      required: [
        'workplace',
        'prefecture',
        'nearestStation',
        'remoteType',
        'remoteDaysPerWeek',
        'workStartTime',
        'workEndTime',
      ],
    },
    interviewCount: { type: ['integer', 'null'] },
    interviewScheduleText: nullableString,
    companyCandidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          relationType: nullableString,
          contactName: nullableString,
          evidence: { type: 'string' },
        },
        required: ['name', 'relationType', 'contactName', 'evidence'],
      },
    },
    uncertainties: { type: 'array', items: { type: 'string' } },
    confidenceScore: { type: 'number' },
  },
  required: [
    'projectName',
    'summary',
    'responsibilities',
    'openings',
    'startOn',
    'endOn',
    'requiredSkills',
    'preferredSkills',
    'commercial',
    'workConditions',
    'interviewCount',
    'interviewScheduleText',
    'companyCandidates',
    'uncertainties',
    'confidenceScore',
  ],
};
