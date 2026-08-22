import { requiredEnv } from '../../plugins/authentication.js';
import { assertSupabaseResponse } from '../../shared/supabase-response.js';
import type {
  ProjectMatchExplanation,
  ProjectMatchRun,
} from './project-match-service.js';

export interface ProjectMatchRepository {
  canExecute(token: string): Promise<boolean>;
  calculate(
    token: string,
    projectId: string,
    limit: number,
    provider: string,
    modelName: string,
    promptVersion: string,
    requestId: string,
  ): Promise<ProjectMatchRun>;
  complete(
    token: string,
    runId: string,
    executionId: string,
    explanation: ProjectMatchExplanation,
    inputTokens: number | null,
    outputTokens: number | null,
  ): Promise<ProjectMatchRun>;
  fail(
    token: string,
    runId: string,
    executionId: string,
    code: string,
    message: string,
  ): Promise<void>;
  get(
    token: string,
    projectId: string,
    runId?: string,
  ): Promise<ProjectMatchRun | null>;
}

export class SupabaseProjectMatchRepository implements ProjectMatchRepository {
  canExecute(token: string) {
    return this.permission(token, 'ai.execute');
  }

  async calculate(
    token: string,
    projectId: string,
    limit: number,
    provider: string,
    modelName: string,
    promptVersion: string,
    requestId: string,
  ) {
    return map(
      (await this.rpc(token, 'calculate_project_engineer_matches', {
        p_project_id: projectId,
        p_limit: limit,
        p_provider: provider,
        p_model_name: modelName,
        p_prompt_version: promptVersion,
        p_request_id: requestId,
      })) as MatchRow,
    );
  }

  async complete(
    token: string,
    runId: string,
    executionId: string,
    explanation: ProjectMatchExplanation,
    inputTokens: number | null,
    outputTokens: number | null,
  ) {
    return map(
      (await this.rpc(token, 'complete_project_engineer_match', {
        p_match_run_id: runId,
        p_ai_execution_id: executionId,
        p_explanations: explanation,
        p_input_tokens: inputTokens,
        p_output_tokens: outputTokens,
      })) as MatchRow,
    );
  }

  async fail(
    token: string,
    runId: string,
    executionId: string,
    code: string,
    message: string,
  ) {
    await this.rpc(token, 'fail_project_engineer_match', {
      p_match_run_id: runId,
      p_ai_execution_id: executionId,
      p_error_code: code,
      p_error_message: message,
    });
  }

  async get(token: string, projectId: string, runId?: string) {
    const row = await this.rpc(token, 'get_project_engineer_match', {
      p_project_id: projectId,
      p_match_run_id: runId ?? null,
    });
    return row ? map(row as MatchRow) : null;
  }

  private async permission(token: string, required_permission: string) {
    return (
      (await (
        await this.request(token, '/rpc/has_permission', {
          method: 'POST',
          body: JSON.stringify({ required_permission }),
        })
      ).json()) === true
    );
  }

  private async rpc(token: string, name: string, body: object) {
    return await (
      await this.request(token, `/rpc/${name}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    ).json();
  }

  private async request(token: string, path: string, init: RequestInit) {
    const response = await fetch(
      `${requiredEnv('SUPABASE_URL')}/rest/v1${path}`,
      {
        ...init,
        headers: {
          apikey: requiredEnv('SUPABASE_ANON_KEY'),
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
      },
    );
    await assertSupabaseResponse(
      response,
      'Project match data service request failed',
    );
    return response;
  }
}

type CandidateRow = {
  id: string;
  engineer_id: string;
  resume_version_id: string | null;
  rank: number;
  overall_score: number;
  required_skill_score: number;
  preferred_skill_score: number;
  availability_score: number;
  rate_score: number;
  location_score: number;
  required_conditions_met: boolean;
  confidence_score: number;
  matched_skills: Array<Record<string, unknown>>;
  missing_skills: Array<Record<string, unknown>>;
  warnings: string[];
  facts: Record<string, unknown>;
  explanation: ProjectMatchRun['candidates'][number]['explanation'];
};

type MatchRow = {
  id: string;
  project_id: string;
  project_requirement_version_id: string | null;
  ai_execution_id: string;
  status: ProjectMatchRun['status'];
  calculation_version: string;
  criteria: Record<string, unknown>;
  candidate_count: number;
  overall_summary: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  candidates: CandidateRow[];
};

function map(row: MatchRow): ProjectMatchRun {
  return {
    id: row.id,
    projectId: row.project_id,
    projectRequirementVersionId: row.project_requirement_version_id,
    aiExecutionId: row.ai_execution_id,
    status: row.status,
    calculationVersion: row.calculation_version,
    criteria: row.criteria,
    candidateCount: row.candidate_count,
    overallSummary: row.overall_summary,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    candidates: row.candidates.map((candidate) => ({
      id: candidate.id,
      engineerId: candidate.engineer_id,
      resumeVersionId: candidate.resume_version_id,
      rank: candidate.rank,
      overallScore: Number(candidate.overall_score),
      requiredSkillScore: Number(candidate.required_skill_score),
      preferredSkillScore: Number(candidate.preferred_skill_score),
      availabilityScore: Number(candidate.availability_score),
      rateScore: Number(candidate.rate_score),
      locationScore: Number(candidate.location_score),
      requiredConditionsMet: candidate.required_conditions_met,
      confidenceScore: Number(candidate.confidence_score),
      matchedSkills: candidate.matched_skills,
      missingSkills: candidate.missing_skills,
      warnings: candidate.warnings,
      facts: candidate.facts,
      explanation: candidate.explanation,
    })),
  };
}
