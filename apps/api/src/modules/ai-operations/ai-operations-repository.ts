import { dataApiSchemaHeaders } from '../../shared/supabase-schema.js';
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

export interface AiBudgetPolicy {
  canManage: boolean;
  configured: boolean;
  enabled: boolean;
  currency: string;
  dailyWarningAmount: number | null;
  dailyStopAmount: number | null;
  monthlyWarningAmount: number | null;
  monthlyStopAmount: number | null;
  dailyWarningExecutions: number | null;
  dailyStopExecutions: number | null;
  monthlyWarningExecutions: number | null;
  monthlyStopExecutions: number | null;
  dailyExecutionCount: number;
  monthlyExecutionCount: number;
  dailyEstimatedCost: number;
  monthlyEstimatedCost: number;
  dailyCostRecordedCount: number;
  monthlyCostRecordedCount: number;
  warningReached: boolean;
  stopReached: boolean;
  stopReasons: string[];
  rowVersion: number;
  updatedAt: string | null;
}

export interface AiBudgetPolicyInput {
  enabled: boolean;
  currency: string;
  dailyWarningAmount: number | null;
  dailyStopAmount: number | null;
  monthlyWarningAmount: number | null;
  monthlyStopAmount: number | null;
  dailyWarningExecutions: number | null;
  dailyStopExecutions: number | null;
  monthlyWarningExecutions: number | null;
  monthlyStopExecutions: number | null;
}

export interface AiOperationsRepository {
  canRead(token: string): Promise<boolean>;
  canManage(token: string): Promise<boolean>;
  get(
    token: string,
    fromDate: string,
    toDate: string,
  ): Promise<AiOperationsDashboard>;
  getBudget(token: string): Promise<AiBudgetPolicy>;
  saveBudget(
    token: string,
    rowVersion: number,
    input: AiBudgetPolicyInput,
    requestId: string,
  ): Promise<AiBudgetPolicy | null>;
}

export class SupabaseAiOperationsRepository implements AiOperationsRepository {
  async canRead(token: string) {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'ai.read' }),
    });
    return (await response.json()) === true;
  }

  async canManage(token: string) {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'tenant.manage' }),
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

  async getBudget(token: string) {
    const response = await this.request(token, '/rpc/get_ai_budget_policy', {
      method: 'POST',
      body: '{}',
    });
    return mapBudget((await response.json()) as BudgetRow);
  }

  async saveBudget(
    token: string,
    rowVersion: number,
    input: AiBudgetPolicyInput,
    requestId: string,
  ) {
    const response = await this.request(token, '/rpc/save_ai_budget_policy', {
      method: 'POST',
      body: JSON.stringify({
        p_row_version: rowVersion,
        p_enabled: input.enabled,
        p_currency: input.currency,
        p_daily_warning_amount: input.dailyWarningAmount,
        p_daily_stop_amount: input.dailyStopAmount,
        p_monthly_warning_amount: input.monthlyWarningAmount,
        p_monthly_stop_amount: input.monthlyStopAmount,
        p_daily_warning_executions: input.dailyWarningExecutions,
        p_daily_stop_executions: input.dailyStopExecutions,
        p_monthly_warning_executions: input.monthlyWarningExecutions,
        p_monthly_stop_executions: input.monthlyStopExecutions,
        p_request_id: requestId,
      }),
    });
    const row = (await response.json()) as BudgetRow | null;
    return row ? mapBudget(row) : null;
  }

  private async request(token: string, path: string, init: RequestInit) {
    const response = await fetch(
      `${requiredEnv('SUPABASE_URL')}/rest/v1${path}`,
      {
        ...init,
        headers: {
          apikey: requiredEnv('SUPABASE_ANON_KEY'),
          authorization: `Bearer ${token}`,
          ...dataApiSchemaHeaders(path),
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

type BudgetRow = {
  configured: boolean;
  enabled: boolean;
  currency: string;
  daily_warning_amount: number | null;
  daily_stop_amount: number | null;
  monthly_warning_amount: number | null;
  monthly_stop_amount: number | null;
  daily_warning_executions: number | null;
  daily_stop_executions: number | null;
  monthly_warning_executions: number | null;
  monthly_stop_executions: number | null;
  daily_execution_count: number;
  monthly_execution_count: number;
  daily_estimated_cost: number;
  monthly_estimated_cost: number;
  daily_cost_recorded_count: number;
  monthly_cost_recorded_count: number;
  warning_reached: boolean;
  stop_reached: boolean;
  stop_reasons: string[];
  row_version: number;
  updated_at: string | null;
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

function mapBudget(row: BudgetRow): AiBudgetPolicy {
  return {
    canManage: false,
    configured: row.configured,
    enabled: row.enabled,
    currency: row.currency,
    dailyWarningAmount: row.daily_warning_amount,
    dailyStopAmount: row.daily_stop_amount,
    monthlyWarningAmount: row.monthly_warning_amount,
    monthlyStopAmount: row.monthly_stop_amount,
    dailyWarningExecutions: row.daily_warning_executions,
    dailyStopExecutions: row.daily_stop_executions,
    monthlyWarningExecutions: row.monthly_warning_executions,
    monthlyStopExecutions: row.monthly_stop_executions,
    dailyExecutionCount: row.daily_execution_count,
    monthlyExecutionCount: row.monthly_execution_count,
    dailyEstimatedCost: row.daily_estimated_cost,
    monthlyEstimatedCost: row.monthly_estimated_cost,
    dailyCostRecordedCount: row.daily_cost_recorded_count,
    monthlyCostRecordedCount: row.monthly_cost_recorded_count,
    warningReached: row.warning_reached,
    stopReached: row.stop_reached,
    stopReasons: row.stop_reasons,
    rowVersion: row.row_version,
    updatedAt: row.updated_at,
  };
}
