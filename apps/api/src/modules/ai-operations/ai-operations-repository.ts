import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export interface AiUsageDay {
  usageDate: string;
  executionCount: number;
  succeededCount: number;
  failedCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface AiTypeUsage {
  executionType: string;
  executionCount: number;
  succeededCount: number;
  failedCount: number;
  successRate: number | null;
  totalTokens: number;
}

export interface AiModelUsage {
  provider: string;
  modelName: string;
  currency: string;
  executionCount: number;
  failedCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  costRecordedCount: number;
}

export interface AiCostByCurrency {
  currency: string;
  estimatedCost: number;
  recordedCount: number;
}

export interface AiRecentFailure {
  id: string;
  executionType: string;
  provider: string;
  modelName: string;
  errorCode: string | null;
  requestedAt: string;
  completedAt: string | null;
}

export interface AiOperationsDashboard {
  fromDate: string;
  toDate: string;
  executionCount: number;
  succeededCount: number;
  failedCount: number;
  activeCount: number;
  reviewRequiredCount: number;
  successRate: number | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokenRecordedCount: number;
  costRecordedCount: number;
  costCoverageRate: number | null;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
  pendingReviewCount: number;
  reviewedCount: number;
  approvedCount: number;
  partiallyApprovedCount: number;
  rejectedCount: number;
  changesRequestedCount: number;
  approvalRate: number | null;
  feedbackCount: number;
  averageRating: number | null;
  issueFeedbackCount: number;
  unsafeFeedbackCount: number;
  daily: AiUsageDay[];
  typeUsage: AiTypeUsage[];
  modelUsage: AiModelUsage[];
  costByCurrency: AiCostByCurrency[];
  recentFailures: AiRecentFailure[];
}

export interface AiOperationsRepository {
  canRead(token: string): Promise<boolean>;
  get(
    token: string,
    fromDate: string,
    toDate: string,
  ): Promise<AiOperationsDashboard>;
}

export class SupabaseAiOperationsRepository implements AiOperationsRepository {
  async canRead(token: string) {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'ai.read' }),
    });
    return (await response.json()) === true;
  }

  async get(token: string, fromDate: string, toDate: string) {
    const response = await this.request(
      token,
      '/rpc/get_ai_operations_dashboard',
      {
        method: 'POST',
        body: JSON.stringify({
          p_from_date: fromDate,
          p_to_date: toDate,
        }),
      },
    );
    return map((await response.json()) as DashboardRow);
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
        502,
        'upstream_error',
        'AI operations data service request failed',
      );
    return response;
  }
}

type DashboardRow = Record<string, unknown> & {
  from_date: string;
  to_date: string;
  execution_count: number;
  succeeded_count: number;
  failed_count: number;
  active_count: number;
  review_required_count: number;
  success_rate: number | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  token_recorded_count: number;
  cost_recorded_count: number;
  cost_coverage_rate: number | null;
  average_latency_ms: number | null;
  p95_latency_ms: number | null;
  pending_review_count: number;
  reviewed_count: number;
  approved_count: number;
  partially_approved_count: number;
  rejected_count: number;
  changes_requested_count: number;
  approval_rate: number | null;
  feedback_count: number;
  average_rating: number | null;
  issue_feedback_count: number;
  unsafe_feedback_count: number;
  daily: Array<Record<string, number | string>>;
  type_usage: Array<Record<string, number | string | null>>;
  model_usage: Array<Record<string, number | string>>;
  cost_by_currency: Array<Record<string, number | string>>;
  recent_failures: Array<Record<string, string | null>>;
};

function map(row: DashboardRow): AiOperationsDashboard {
  return {
    fromDate: row.from_date,
    toDate: row.to_date,
    executionCount: row.execution_count,
    succeededCount: row.succeeded_count,
    failedCount: row.failed_count,
    activeCount: row.active_count,
    reviewRequiredCount: row.review_required_count,
    successRate: row.success_rate,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    tokenRecordedCount: row.token_recorded_count,
    costRecordedCount: row.cost_recorded_count,
    costCoverageRate: row.cost_coverage_rate,
    averageLatencyMs: row.average_latency_ms,
    p95LatencyMs: row.p95_latency_ms,
    pendingReviewCount: row.pending_review_count,
    reviewedCount: row.reviewed_count,
    approvedCount: row.approved_count,
    partiallyApprovedCount: row.partially_approved_count,
    rejectedCount: row.rejected_count,
    changesRequestedCount: row.changes_requested_count,
    approvalRate: row.approval_rate,
    feedbackCount: row.feedback_count,
    averageRating: row.average_rating,
    issueFeedbackCount: row.issue_feedback_count,
    unsafeFeedbackCount: row.unsafe_feedback_count,
    daily: row.daily.map((item) => ({
      usageDate: item.usage_date as string,
      executionCount: item.execution_count as number,
      succeededCount: item.succeeded_count as number,
      failedCount: item.failed_count as number,
      totalTokens: item.total_tokens as number,
      estimatedCostUsd: item.estimated_cost_usd as number,
    })),
    typeUsage: row.type_usage.map((item) => ({
      executionType: item.execution_type as string,
      executionCount: item.execution_count as number,
      succeededCount: item.succeeded_count as number,
      failedCount: item.failed_count as number,
      successRate: item.success_rate as number | null,
      totalTokens: item.total_tokens as number,
    })),
    modelUsage: row.model_usage.map((item) => ({
      provider: item.provider as string,
      modelName: item.model_name as string,
      currency: item.currency as string,
      executionCount: item.execution_count as number,
      failedCount: item.failed_count as number,
      inputTokens: item.input_tokens as number,
      outputTokens: item.output_tokens as number,
      estimatedCost: item.estimated_cost as number,
      costRecordedCount: item.cost_recorded_count as number,
    })),
    costByCurrency: row.cost_by_currency.map((item) => ({
      currency: item.currency as string,
      estimatedCost: item.estimated_cost as number,
      recordedCount: item.recorded_count as number,
    })),
    recentFailures: row.recent_failures.map((item) => ({
      id: item.id as string,
      executionType: item.execution_type as string,
      provider: item.provider as string,
      modelName: item.model_name as string,
      errorCode: item.error_code ?? null,
      requestedAt: item.requested_at as string,
      completedAt: item.completed_at ?? null,
    })),
  };
}
