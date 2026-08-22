import { requiredEnv } from '../../plugins/authentication.js';
import { assertSupabaseResponse } from '../../shared/supabase-response.js';
import type {
  InterviewSummaryGeneration,
  InterviewSummaryInput,
} from './interview-summary-service.js';

export interface InterviewSummary {
  aiExecutionId: string;
  interviewId: string;
  proposalId: string;
  interviewRowVersion: number;
  status: string;
  provider: string;
  modelName: string;
  promptVersion: string;
  errorCode: string | null;
  errorMessage: string | null;
  result: InterviewSummaryGeneration | null;
  originalResult: InterviewSummaryGeneration | null;
  reviewStatus: string | null;
  reviewComment: string | null;
  reviewedAt: string | null;
  reviewRowVersion: number | null;
  generatedTaskIds: string[];
  requestedAt: string;
  completedAt: string | null;
  rowVersion: number;
}

export interface InterviewSummaryRepository {
  canExecute(token: string): Promise<boolean>;
  canReview(token: string): Promise<boolean>;
  canAiRead(token: string): Promise<boolean>;
  canInterviewRead(token: string): Promise<boolean>;
  canInterviewManage(token: string): Promise<boolean>;
  canTaskManage(token: string): Promise<boolean>;
  start(
    token: string,
    interviewId: string,
    additionalInstructions: string | null,
    provider: string,
    modelName: string,
    promptVersion: string,
    requestId: string,
  ): Promise<{
    summary: InterviewSummary;
    summaryInput: InterviewSummaryInput;
  } | null>;
  complete(
    token: string,
    interviewId: string,
    executionId: string,
    result: InterviewSummaryGeneration,
    inputTokens: number | null,
    outputTokens: number | null,
    requestId: string,
  ): Promise<InterviewSummary>;
  fail(
    token: string,
    interviewId: string,
    executionId: string,
    code: string,
    message: string,
    requestId: string,
  ): Promise<void>;
  review(
    token: string,
    interviewId: string,
    executionId: string,
    reviewRowVersion: number,
    decision: 'approve' | 'reject',
    editedResult: InterviewSummaryGeneration | null,
    acceptedActionItemIndexes: number[],
    reviewComment: string | null,
    requestId: string,
  ): Promise<InterviewSummary | null>;
  get(
    token: string,
    interviewId: string,
    executionId?: string,
  ): Promise<InterviewSummary | null>;
}

export class SupabaseInterviewSummaryRepository implements InterviewSummaryRepository {
  canExecute(token: string) {
    return this.permission(token, 'ai.execute');
  }
  canReview(token: string) {
    return this.permission(token, 'ai.review');
  }
  canAiRead(token: string) {
    return this.permission(token, 'ai.read');
  }
  canInterviewRead(token: string) {
    return this.permission(token, 'interview.read');
  }
  canInterviewManage(token: string) {
    return this.permission(token, 'interview.manage');
  }
  canTaskManage(token: string) {
    return this.permission(token, 'task.manage');
  }

  async start(
    token: string,
    interviewId: string,
    additionalInstructions: string | null,
    provider: string,
    modelName: string,
    promptVersion: string,
    requestId: string,
  ) {
    const row = (await this.rpc(token, 'start_interview_summary', {
      p_interview_id: interviewId,
      p_additional_instructions: additionalInstructions,
      p_provider: provider,
      p_model_name: modelName,
      p_prompt_version: promptVersion,
      p_request_id: requestId,
    })) as StartRow | null;
    return row
      ? { summary: map(row.summary), summaryInput: row.summary_input }
      : null;
  }

  async complete(
    token: string,
    interviewId: string,
    executionId: string,
    result: InterviewSummaryGeneration,
    inputTokens: number | null,
    outputTokens: number | null,
    requestId: string,
  ) {
    return map(
      (await this.rpc(token, 'complete_interview_summary', {
        p_interview_id: interviewId,
        p_ai_execution_id: executionId,
        p_result: result,
        p_input_tokens: inputTokens,
        p_output_tokens: outputTokens,
        p_request_id: requestId,
      })) as SummaryRow,
    );
  }

  async fail(
    token: string,
    interviewId: string,
    executionId: string,
    code: string,
    message: string,
    requestId: string,
  ) {
    await this.rpc(token, 'fail_interview_summary', {
      p_interview_id: interviewId,
      p_ai_execution_id: executionId,
      p_error_code: code,
      p_error_message: message,
      p_request_id: requestId,
    });
  }

  async review(
    token: string,
    interviewId: string,
    executionId: string,
    reviewRowVersion: number,
    decision: 'approve' | 'reject',
    editedResult: InterviewSummaryGeneration | null,
    acceptedActionItemIndexes: number[],
    reviewComment: string | null,
    requestId: string,
  ) {
    const row = await this.rpc(token, 'review_interview_summary', {
      p_interview_id: interviewId,
      p_ai_execution_id: executionId,
      p_review_row_version: reviewRowVersion,
      p_decision: decision,
      p_edited_result: editedResult,
      p_accepted_action_item_indexes: acceptedActionItemIndexes,
      p_review_comment: reviewComment,
      p_request_id: requestId,
    });
    return row ? map(row as SummaryRow) : null;
  }

  async get(token: string, interviewId: string, executionId?: string) {
    const row = await this.rpc(token, 'get_interview_summary', {
      p_interview_id: interviewId,
      p_ai_execution_id: executionId ?? null,
    });
    return row ? map(row as SummaryRow) : null;
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
      'Interview summary data service request failed',
    );
    return response;
  }
}

type SummaryRow = {
  ai_execution_id: string;
  interview_id: string;
  proposal_id: string;
  interview_row_version: number;
  status: string;
  provider: string;
  model_name: string;
  prompt_version: string;
  error_code: string | null;
  error_message: string | null;
  result: InterviewSummaryGeneration | null;
  original_result: InterviewSummaryGeneration | null;
  review_status: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  review_row_version: number | null;
  generated_task_ids: string[];
  requested_at: string;
  completed_at: string | null;
  row_version: number;
};

type StartRow = {
  summary: SummaryRow;
  summary_input: InterviewSummaryInput;
};

function map(row: SummaryRow): InterviewSummary {
  return {
    aiExecutionId: row.ai_execution_id,
    interviewId: row.interview_id,
    proposalId: row.proposal_id,
    interviewRowVersion: row.interview_row_version,
    status: row.status,
    provider: row.provider,
    modelName: row.model_name,
    promptVersion: row.prompt_version,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    result: row.result,
    originalResult: row.original_result,
    reviewStatus: row.review_status,
    reviewComment: row.review_comment,
    reviewedAt: row.reviewed_at,
    reviewRowVersion: row.review_row_version,
    generatedTaskIds: row.generated_task_ids,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
    rowVersion: row.row_version,
  };
}
