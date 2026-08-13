import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export type EngagementStatus =
  'draft' | 'preparing' | 'active' | 'ending' | 'ended' | 'cancelled';

export interface EngagementSummary {
  id: string;
  engagementNo: string;
  contractId: string;
  proposalId: string | null;
  engineerId: string;
  engineerName: string;
  contractTitle: string;
  status: EngagementStatus;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  roleName: string | null;
  workLocation: string | null;
  remoteFrequency: string | null;
  updatedAt: string;
  rowVersion: number;
}

export interface EngagementCondition {
  id: string;
  versionNo: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  monthlySalesAmount: number | null;
  monthlyCostAmount: number | null;
  currency: string;
  settlementLowerHours: number | null;
  settlementUpperHours: number | null;
  workLocation: string | null;
  remoteFrequency: string | null;
  notes: string | null;
  createdAt: string;
}

export interface EngagementStatusHistory {
  id: string;
  fromStatus: EngagementStatus | null;
  toStatus: EngagementStatus;
  changeReason: string | null;
  changedAt: string;
}

export interface Engagement extends EngagementSummary {
  previousEngagementId: string | null;
  conditions: EngagementCondition[];
  statusHistories: EngagementStatusHistory[];
}

export interface EngagementListQuery {
  limit: number;
  cursor?: { updatedAt: string; id: string };
  query?: string;
  status?: EngagementStatus;
}

export interface EngagementListResult {
  items: EngagementSummary[];
  nextCursor: { updatedAt: string; id: string } | null;
}

export interface EngagementRepository {
  canRead(accessToken: string): Promise<boolean>;
  list(
    accessToken: string,
    query: EngagementListQuery,
  ): Promise<EngagementListResult>;
  findById(accessToken: string, id: string): Promise<Engagement | null>;
}

type EngagementSummaryRow = {
  id: string;
  engagement_no: string;
  contract_id: string;
  proposal_id: string | null;
  engineer_id: string;
  engineer_name: string;
  contract_title: string;
  status: EngagementStatus;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  role_name: string | null;
  work_location: string | null;
  remote_frequency: string | null;
  updated_at: string;
  row_version: number;
};

type EngagementDetailRow = EngagementSummaryRow & {
  previous_engagement_id: string | null;
  conditions: Array<{
    id: string;
    version_no: number;
    effective_from: string;
    effective_to: string | null;
    monthly_sales_amount: number | null;
    monthly_cost_amount: number | null;
    currency: string;
    settlement_lower_hours: number | null;
    settlement_upper_hours: number | null;
    work_location: string | null;
    remote_frequency: string | null;
    notes: string | null;
    created_at: string;
  }>;
  status_histories: Array<{
    id: string;
    from_status: EngagementStatus | null;
    to_status: EngagementStatus;
    change_reason: string | null;
    changed_at: string;
  }>;
};

type EngagementListRow = {
  items: EngagementSummaryRow[];
  next_cursor: { updated_at: string; id: string } | null;
};

export class SupabaseEngagementRepository implements EngagementRepository {
  async canRead(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'contract.read' }),
    });
    return (await response.json()) === true;
  }

  async list(
    token: string,
    query: EngagementListQuery,
  ): Promise<EngagementListResult> {
    const response = await this.request(
      token,
      '/rpc/list_engagement_summaries',
      {
        method: 'POST',
        body: JSON.stringify({
          p_query: query.query ?? null,
          p_status: query.status ?? null,
          p_limit: query.limit,
          p_cursor_updated_at: query.cursor?.updatedAt ?? null,
          p_cursor_id: query.cursor?.id ?? null,
        }),
      },
    );
    const result = (await response.json()) as EngagementListRow;
    return {
      items: result.items.map(toEngagementSummary),
      nextCursor: result.next_cursor
        ? {
            updatedAt: result.next_cursor.updated_at,
            id: result.next_cursor.id,
          }
        : null,
    };
  }

  async findById(token: string, id: string): Promise<Engagement | null> {
    const response = await this.request(
      token,
      '/rpc/get_engagement_detail',
      {
        method: 'POST',
        body: JSON.stringify({ p_engagement_id: id }),
      },
      true,
    );
    if (response.status === 403) return null;
    const row = (await response.json()) as EngagementDetailRow | null;
    return row ? toEngagement(row) : null;
  }

  private async request(
    token: string,
    path: string,
    init: RequestInit = {},
    hideForbidden = false,
  ): Promise<Response> {
    const response = await fetch(
      `${requiredEnv('SUPABASE_URL')}/rest/v1${path}`,
      {
        ...init,
        headers: {
          apikey: requiredEnv('SUPABASE_ANON_KEY'),
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/json',
          ...(init.headers ?? {}),
        },
      },
    );
    if (!response.ok && !(hideForbidden && response.status === 403))
      throw new ApiError(
        502,
        'upstream_error',
        'Engagement data service request failed',
      );
    return response;
  }
}

function toEngagementSummary(row: EngagementSummaryRow): EngagementSummary {
  return {
    id: row.id,
    engagementNo: row.engagement_no,
    contractId: row.contract_id,
    proposalId: row.proposal_id,
    engineerId: row.engineer_id,
    engineerName: row.engineer_name,
    contractTitle: row.contract_title,
    status: row.status,
    plannedStartDate: row.planned_start_date,
    plannedEndDate: row.planned_end_date,
    actualStartDate: row.actual_start_date,
    actualEndDate: row.actual_end_date,
    roleName: row.role_name,
    workLocation: row.work_location,
    remoteFrequency: row.remote_frequency,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}

function toEngagement(row: EngagementDetailRow): Engagement {
  return {
    ...toEngagementSummary(row),
    previousEngagementId: row.previous_engagement_id,
    conditions: row.conditions.map((condition) => ({
      id: condition.id,
      versionNo: condition.version_no,
      effectiveFrom: condition.effective_from,
      effectiveTo: condition.effective_to,
      monthlySalesAmount: condition.monthly_sales_amount,
      monthlyCostAmount: condition.monthly_cost_amount,
      currency: condition.currency,
      settlementLowerHours: condition.settlement_lower_hours,
      settlementUpperHours: condition.settlement_upper_hours,
      workLocation: condition.work_location,
      remoteFrequency: condition.remote_frequency,
      notes: condition.notes,
      createdAt: condition.created_at,
    })),
    statusHistories: row.status_histories.map((history) => ({
      id: history.id,
      fromStatus: history.from_status,
      toStatus: history.to_status,
      changeReason: history.change_reason,
      changedAt: history.changed_at,
    })),
  };
}
