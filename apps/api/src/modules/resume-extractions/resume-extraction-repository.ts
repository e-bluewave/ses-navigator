import { requiredEnv } from '../../plugins/authentication.js';
import { assertSupabaseResponse } from '../../shared/supabase-response.js';
import type { ResumeExtractionResult } from './resume-extraction-service.js';

export interface ResumeExtraction {
  id: string;
  resumeVersionId: string;
  aiExecutionId: string;
  status: string;
  provider: string;
  modelName: string;
  promptVersion: string;
  result: ResumeExtractionResult | null;
  errorMessage: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
}
export interface ResumeExtractionRepository {
  canExecute(token: string): Promise<boolean>;
  canReview(token: string): Promise<boolean>;
  start(
    token: string,
    engineerId: string,
    versionId: string,
    sourceText: string,
    provider: string,
    model: string,
    prompt: string,
    requestId: string,
  ): Promise<{ extractionId: string; aiExecutionId: string }>;
  complete(
    token: string,
    extractionId: string,
    executionId: string,
    result: ResumeExtractionResult,
    inputTokens: number | null,
    outputTokens: number | null,
    requestId: string,
  ): Promise<void>;
  fail(
    token: string,
    extractionId: string,
    executionId: string,
    code: string,
    message: string,
  ): Promise<void>;
  get(
    token: string,
    engineerId: string,
    versionId: string,
    extractionId?: string,
  ): Promise<ResumeExtraction | null>;
  review(
    token: string,
    engineerId: string,
    versionId: string,
    extractionId: string,
    decision: 'approved' | 'rejected',
    correctedResult: ResumeExtractionResult | null,
    notes: string | null,
    requestId: string,
  ): Promise<ResumeExtraction>;
}
export class SupabaseResumeExtractionRepository implements ResumeExtractionRepository {
  canExecute(token: string) {
    return this.permission(token, 'ai.execute');
  }
  canReview(token: string) {
    return this.permission(token, 'ai.review');
  }
  async start(
    token: string,
    engineerId: string,
    versionId: string,
    sourceText: string,
    provider: string,
    model: string,
    prompt: string,
    requestId: string,
  ) {
    const row = (await this.rpc(token, 'request_resume_extraction', {
      p_engineer_id: engineerId,
      p_resume_version_id: versionId,
      p_source_text: sourceText,
      p_provider: provider,
      p_model_name: model,
      p_prompt_version: prompt,
      p_request_id: requestId,
    })) as { extraction_id: string; ai_execution_id: string };
    return {
      extractionId: row.extraction_id,
      aiExecutionId: row.ai_execution_id,
    };
  }
  async complete(
    token: string,
    extractionId: string,
    executionId: string,
    result: ResumeExtractionResult,
    inputTokens: number | null,
    outputTokens: number | null,
    requestId: string,
  ) {
    await this.rpc(token, 'complete_resume_extraction', {
      p_extraction_id: extractionId,
      p_ai_execution_id: executionId,
      p_result: result,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_request_id: requestId,
    });
  }
  async fail(
    token: string,
    extractionId: string,
    executionId: string,
    code: string,
    message: string,
  ) {
    await this.rpc(token, 'fail_resume_extraction', {
      p_extraction_id: extractionId,
      p_ai_execution_id: executionId,
      p_error_code: code,
      p_error_message: message,
    });
  }
  async get(
    token: string,
    engineerId: string,
    versionId: string,
    extractionId?: string,
  ) {
    const row = await this.rpc(token, 'get_resume_extraction', {
      p_engineer_id: engineerId,
      p_resume_version_id: versionId,
      p_extraction_id: extractionId ?? null,
    });
    return row ? map(row as Row) : null;
  }
  async review(
    token: string,
    engineerId: string,
    versionId: string,
    extractionId: string,
    decision: 'approved' | 'rejected',
    correctedResult: ResumeExtractionResult | null,
    notes: string | null,
    requestId: string,
  ) {
    return map(
      (await this.rpc(token, 'review_resume_extraction', {
        p_engineer_id: engineerId,
        p_resume_version_id: versionId,
        p_extraction_id: extractionId,
        p_decision: decision,
        p_corrected_result: correctedResult,
        p_review_notes: notes,
        p_request_id: requestId,
      })) as Row,
    );
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
      'Resume extraction data service request failed',
    );
    return response;
  }
}
type Row = {
  id: string;
  resume_version_id: string;
  ai_execution_id: string;
  status: string;
  provider: string;
  model_name: string;
  prompt_version: string;
  result: ResumeExtractionResult | null;
  error_message: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
};
function map(r: Row): ResumeExtraction {
  return {
    id: r.id,
    resumeVersionId: r.resume_version_id,
    aiExecutionId: r.ai_execution_id,
    status: r.status,
    provider: r.provider,
    modelName: r.model_name,
    promptVersion: r.prompt_version,
    result: r.result,
    errorMessage: r.error_message,
    reviewNotes: r.review_notes,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
  };
}
