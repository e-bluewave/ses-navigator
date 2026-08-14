import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';
import type {
  ProposalMessageCompositionInput,
  ProposalMessageGeneration,
} from './proposal-message-draft-service.js';

export interface ProposalMessageDraft {
  id: string;
  proposalId: string;
  projectId: string;
  engineerId: string;
  channel: string;
  status: 'draft' | 'approved' | 'cancelled' | 'queued' | 'sent' | 'failed';
  subject: string;
  bodyText: string;
  messageTemplateId: string | null;
  currentVersionId: string | null;
  currentVersionNo: number | null;
  currentGenerationSource: 'manual' | 'template' | 'ai' | 'import' | null;
  approvedVersionId: string | null;
  approvedAt: string | null;
  aiExecutionId: string;
  aiStatus: string;
  aiErrorCode: string | null;
  aiErrorMessage: string | null;
  promptVersion: string;
  modelProvider: string;
  modelName: string;
  reviewStatus: string | null;
  reviewComment: string | null;
  generation: ProposalMessageGeneration | null;
  recipients: Array<{ type: string; name: string | null; address: string }>;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
}

export interface ProposalMessageDraftRepository {
  canExecute(token: string): Promise<boolean>;
  canManage(token: string): Promise<boolean>;
  canReview(token: string): Promise<boolean>;
  canRead(token: string): Promise<boolean>;
  start(
    token: string,
    proposalId: string,
    input: {
      messageTemplateId: string | null;
      tone: string;
      additionalInstructions: string | null;
    },
    provider: string,
    modelName: string,
    promptVersion: string,
    requestId: string,
  ): Promise<{
    draft: ProposalMessageDraft;
    compositionInput: ProposalMessageCompositionInput;
  } | null>;
  complete(
    token: string,
    messageId: string,
    executionId: string,
    result: ProposalMessageGeneration,
    inputTokens: number | null,
    outputTokens: number | null,
  ): Promise<ProposalMessageDraft>;
  fail(
    token: string,
    messageId: string,
    executionId: string,
    code: string,
    message: string,
  ): Promise<void>;
  update(
    token: string,
    messageId: string,
    rowVersion: number,
    subject: string,
    bodyText: string,
    requestId: string,
  ): Promise<ProposalMessageDraft | null>;
  review(
    token: string,
    messageId: string,
    rowVersion: number,
    decision: 'approve' | 'reject',
    comment: string | null,
    requestId: string,
  ): Promise<ProposalMessageDraft | null>;
  get(
    token: string,
    proposalId: string,
    messageId?: string,
  ): Promise<ProposalMessageDraft | null>;
}

export class SupabaseProposalMessageDraftRepository implements ProposalMessageDraftRepository {
  canExecute(token: string) {
    return this.permission(token, 'ai.execute');
  }
  canManage(token: string) {
    return this.permission(token, 'message.manage');
  }
  canReview(token: string) {
    return this.permission(token, 'ai.review');
  }
  canRead(token: string) {
    return this.permission(token, 'message.read');
  }

  async start(
    token: string,
    proposalId: string,
    input: {
      messageTemplateId: string | null;
      tone: string;
      additionalInstructions: string | null;
    },
    provider: string,
    modelName: string,
    promptVersion: string,
    requestId: string,
  ) {
    const row = (await this.rpc(token, 'start_proposal_message_draft', {
      p_proposal_id: proposalId,
      p_message_template_id: input.messageTemplateId,
      p_tone: input.tone,
      p_additional_instructions: input.additionalInstructions,
      p_provider: provider,
      p_model_name: modelName,
      p_prompt_version: promptVersion,
      p_request_id: requestId,
    })) as StartRow | null;
    return row
      ? {
          draft: map(row.draft),
          compositionInput: row.composition_input,
        }
      : null;
  }

  async complete(
    token: string,
    messageId: string,
    executionId: string,
    result: ProposalMessageGeneration,
    inputTokens: number | null,
    outputTokens: number | null,
  ) {
    return map(
      (await this.rpc(token, 'complete_proposal_message_draft', {
        p_message_id: messageId,
        p_ai_execution_id: executionId,
        p_result: result,
        p_input_tokens: inputTokens,
        p_output_tokens: outputTokens,
      })) as DraftRow,
    );
  }

  async fail(
    token: string,
    messageId: string,
    executionId: string,
    code: string,
    message: string,
  ) {
    await this.rpc(token, 'fail_proposal_message_draft', {
      p_message_id: messageId,
      p_ai_execution_id: executionId,
      p_error_code: code,
      p_error_message: message,
    });
  }

  async update(
    token: string,
    messageId: string,
    rowVersion: number,
    subject: string,
    bodyText: string,
    requestId: string,
  ) {
    const row = await this.rpc(token, 'update_proposal_message_draft', {
      p_message_id: messageId,
      p_row_version: rowVersion,
      p_subject: subject,
      p_body_text: bodyText,
      p_request_id: requestId,
    });
    return row ? map(row as DraftRow) : null;
  }

  async review(
    token: string,
    messageId: string,
    rowVersion: number,
    decision: 'approve' | 'reject',
    comment: string | null,
    requestId: string,
  ) {
    const row = await this.rpc(token, 'review_proposal_message_draft', {
      p_message_id: messageId,
      p_row_version: rowVersion,
      p_decision: decision,
      p_review_comment: comment,
      p_request_id: requestId,
    });
    return row ? map(row as DraftRow) : null;
  }

  async get(token: string, proposalId: string, messageId?: string) {
    const row = await this.rpc(token, 'get_proposal_message_draft', {
      p_proposal_id: proposalId,
      p_message_id: messageId ?? null,
    });
    return row ? map(row as DraftRow) : null;
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
    if (!response.ok)
      throw new ApiError(
        response.status === 409 ? 409 : 502,
        response.status === 409 ? 'conflict' : 'upstream_error',
        'Proposal message data service request failed',
      );
    return response;
  }
}

type DraftRow = {
  id: string;
  proposal_id: string;
  project_id: string;
  engineer_id: string;
  channel: string;
  status: ProposalMessageDraft['status'];
  subject: string;
  body_text: string;
  message_template_id: string | null;
  current_version_id: string | null;
  current_version_no: number | null;
  current_generation_source: ProposalMessageDraft['currentGenerationSource'];
  approved_version_id: string | null;
  approved_at: string | null;
  ai_execution_id: string;
  ai_status: string;
  ai_error_code: string | null;
  ai_error_message: string | null;
  prompt_version: string;
  model_provider: string;
  model_name: string;
  review_status: string | null;
  review_comment: string | null;
  generation: ProposalMessageGeneration | null;
  recipients: Array<{ type: string; name: string | null; address: string }>;
  created_at: string;
  updated_at: string;
  row_version: number;
};
type StartRow = {
  draft: DraftRow;
  composition_input: ProposalMessageCompositionInput;
};

function map(row: DraftRow): ProposalMessageDraft {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    projectId: row.project_id,
    engineerId: row.engineer_id,
    channel: row.channel,
    status: row.status,
    subject: row.subject,
    bodyText: row.body_text,
    messageTemplateId: row.message_template_id,
    currentVersionId: row.current_version_id,
    currentVersionNo: row.current_version_no,
    currentGenerationSource: row.current_generation_source,
    approvedVersionId: row.approved_version_id,
    approvedAt: row.approved_at,
    aiExecutionId: row.ai_execution_id,
    aiStatus: row.ai_status,
    aiErrorCode: row.ai_error_code,
    aiErrorMessage: row.ai_error_message,
    promptVersion: row.prompt_version,
    modelProvider: row.model_provider,
    modelName: row.model_name,
    reviewStatus: row.review_status,
    reviewComment: row.review_comment,
    generation: row.generation,
    recipients: row.recipients,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}
