import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export interface MatchEvidencePoint {
  text: string;
  evidence: string;
}

export interface ProjectMatchExplanation {
  overallSummary: string;
  candidates: Array<{
    candidateId: string;
    matches: MatchEvidencePoint[];
    mismatches: MatchEvidencePoint[];
    missingInformation: MatchEvidencePoint[];
    warnings: string[];
    recommendation: string;
    questions: string[];
  }>;
}

export interface ProjectMatchCandidate {
  id: string;
  engineerId: string;
  resumeVersionId: string | null;
  rank: number;
  overallScore: number;
  requiredSkillScore: number;
  preferredSkillScore: number;
  availabilityScore: number;
  rateScore: number;
  locationScore: number;
  requiredConditionsMet: boolean;
  confidenceScore: number;
  matchedSkills: Array<Record<string, unknown>>;
  missingSkills: Array<Record<string, unknown>>;
  warnings: string[];
  facts: Record<string, unknown>;
  explanation: Omit<
    ProjectMatchExplanation['candidates'][number],
    'candidateId'
  > | null;
}

export interface ProjectMatchRun {
  id: string;
  projectId: string;
  projectRequirementVersionId: string | null;
  aiExecutionId: string;
  status: 'explaining' | 'completed' | 'explanation_failed';
  calculationVersion: string;
  criteria: Record<string, unknown>;
  candidateCount: number;
  overallSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  candidates: ProjectMatchCandidate[];
}

export interface ProjectMatchExplainer {
  provider: string;
  modelName: string;
  promptVersion: string;
  explain(match: ProjectMatchRun): Promise<{
    explanation: ProjectMatchExplanation;
    usage: { inputTokens: number | null; outputTokens: number | null };
  }>;
}

export class OpenAIProjectMatchExplainer implements ProjectMatchExplainer {
  readonly provider = 'openai';
  readonly modelName = process.env.OPENAI_MATCH_MODEL ?? 'gpt-5.6';
  readonly promptVersion = 'match.explain.v1';

  async explain(match: ProjectMatchRun) {
    if (match.candidates.length === 0)
      return {
        explanation: {
          overallSummary: '参照可能な候補技術者がいません。',
          candidates: [],
        },
        usage: { inputTokens: null, outputTokens: null },
      };

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
              'Explain deterministic Japanese SES project-engineer matching results. Never change, recalculate, reinterpret, or hide scores, rank, confidence, or requiredConditionsMet. State every required-condition mismatch plainly. Missing information is not a match. Use only supplied facts and deterministic findings as evidence. Never use or infer age, gender, nationality, ethnicity, health, family status, or other sensitive traits. Return concise Japanese explanations and practical follow-up questions.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              criteria: match.criteria,
              candidates: match.candidates.map((candidate) => ({
                candidateId: candidate.id,
                rank: candidate.rank,
                overallScore: candidate.overallScore,
                requiredSkillScore: candidate.requiredSkillScore,
                preferredSkillScore: candidate.preferredSkillScore,
                availabilityScore: candidate.availabilityScore,
                rateScore: candidate.rateScore,
                locationScore: candidate.locationScore,
                requiredConditionsMet: candidate.requiredConditionsMet,
                confidenceScore: candidate.confidenceScore,
                matchedSkills: candidate.matchedSkills,
                missingSkills: candidate.missingSkills,
                warnings: candidate.warnings,
                facts: candidate.facts,
              })),
            }),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'project_match_explanation',
            strict: true,
            schema: explanationSchema(match.candidates.map((x) => x.id)),
          },
        },
      }),
    });
    if (!response.ok)
      throw new ApiError(
        502,
        'openai_error',
        'Project match explanation service request failed',
      );
    const body = (await response.json()) as OpenAIResponse;
    if (body.status !== 'completed')
      throw new ApiError(
        502,
        'openai_incomplete',
        'Project match explanation did not complete',
      );
    const contents = body.output?.flatMap((item) => item.content ?? []) ?? [];
    const refusal = contents.find((item) => item.type === 'refusal');
    if (refusal)
      throw new ApiError(
        422,
        'openai_refusal',
        refusal.refusal ?? 'Project match explanation was refused',
      );
    const text = contents.find((item) => item.type === 'output_text')?.text;
    if (!text)
      throw new ApiError(
        502,
        'openai_invalid_output',
        'Project match explanation returned no structured output',
      );
    let explanation: unknown;
    try {
      explanation = JSON.parse(text);
    } catch {
      throw new ApiError(
        502,
        'openai_invalid_output',
        'Project match explanation returned invalid JSON',
      );
    }
    assertProjectMatchExplanation(
      explanation,
      match.candidates.map((x) => x.id),
    );
    return {
      explanation,
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

export function assertProjectMatchExplanation(
  value: unknown,
  candidateIds: string[],
): asserts value is ProjectMatchExplanation {
  const x = value as Partial<ProjectMatchExplanation> | null;
  if (
    !x ||
    typeof x !== 'object' ||
    typeof x.overallSummary !== 'string' ||
    !Array.isArray(x.candidates) ||
    x.candidates.length !== candidateIds.length ||
    !x.candidates.every(
      (candidate) =>
        candidate &&
        typeof candidate === 'object' &&
        typeof candidate.candidateId === 'string' &&
        Array.isArray(candidate.matches) &&
        candidate.matches.every(validEvidence) &&
        Array.isArray(candidate.mismatches) &&
        candidate.mismatches.every(validEvidence) &&
        Array.isArray(candidate.missingInformation) &&
        candidate.missingInformation.every(validEvidence) &&
        Array.isArray(candidate.warnings) &&
        candidate.warnings.every((item) => typeof item === 'string') &&
        typeof candidate.recommendation === 'string' &&
        Array.isArray(candidate.questions) &&
        candidate.questions.every((item) => typeof item === 'string'),
    ) ||
    new Set(x.candidates.map((candidate) => candidate.candidateId)).size !==
      candidateIds.length ||
    x.candidates.some(
      (candidate) => !candidateIds.includes(candidate.candidateId),
    )
  )
    throw new ApiError(
      502,
      'openai_invalid_output',
      'Project match explanation result is invalid',
    );
}

function validEvidence(value: unknown) {
  const point = value as Partial<MatchEvidencePoint> | null;
  return (
    point !== null &&
    typeof point === 'object' &&
    typeof point.text === 'string' &&
    typeof point.evidence === 'string'
  );
}

function explanationSchema(candidateIds: string[]) {
  const evidence = {
    type: 'object',
    additionalProperties: false,
    properties: { text: { type: 'string' }, evidence: { type: 'string' } },
    required: ['text', 'evidence'],
  };
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      overallSummary: { type: 'string' },
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            candidateId: { type: 'string', enum: candidateIds },
            matches: { type: 'array', items: evidence },
            mismatches: { type: 'array', items: evidence },
            missingInformation: { type: 'array', items: evidence },
            warnings: { type: 'array', items: { type: 'string' } },
            recommendation: { type: 'string' },
            questions: { type: 'array', items: { type: 'string' } },
          },
          required: [
            'candidateId',
            'matches',
            'mismatches',
            'missingInformation',
            'warnings',
            'recommendation',
            'questions',
          ],
        },
      },
    },
    required: ['overallSummary', 'candidates'],
  };
}
