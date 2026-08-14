import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export type WorkLogStatus =
  'draft' | 'submitted' | 'approved' | 'rejected' | 'locked';

export type WorkType =
  'work' | 'paid_leave' | 'absence' | 'holiday' | 'training' | 'other';

export interface WorkLogSummary {
  id: string;
  contractId: string;
  engineerId: string;
  contractTitle: string;
  engineerName: string;
  workMonth: string;
  status: WorkLogStatus;
  scheduledDays: number | null;
  actualDays: number | null;
  scheduledHours: number | null;
  actualHours: number | null;
  overtimeHours: number;
  absenceHours: number;
  customerApprovedAt: string | null;
  updatedAt: string;
  rowVersion: number;
}

export interface WorkLogDetailItem {
  id: string;
  workDate: string;
  workType: WorkType;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  workHours: number;
  overtimeHours: number;
  description: string | null;
  updatedAt: string;
  rowVersion: number;
}

export interface WorkLog extends WorkLogSummary {
  approvedByName: string | null;
  notes: string | null;
  details: WorkLogDetailItem[];
}

export interface WorkLogListQuery {
  limit: number;
  cursor?: { workMonth: string; updatedAt: string; id: string };
  query?: string;
  status?: WorkLogStatus;
  workMonth?: string;
}

export interface WorkLogListResult {
  items: WorkLogSummary[];
  nextCursor: { workMonth: string; updatedAt: string; id: string } | null;
}

export interface WorkLogRepository {
  canRead(accessToken: string): Promise<boolean>;
  list(
    accessToken: string,
    query: WorkLogListQuery,
  ): Promise<WorkLogListResult>;
  findById(accessToken: string, id: string): Promise<WorkLog | null>;
}

type WorkLogSummaryRow = {
  id: string;
  contract_id: string;
  engineer_id: string;
  contract_title: string;
  engineer_name: string;
  work_month: string;
  status: WorkLogStatus;
  scheduled_days: number | null;
  actual_days: number | null;
  scheduled_hours: number | null;
  actual_hours: number | null;
  overtime_hours: number;
  absence_hours: number;
  customer_approved_at: string | null;
  updated_at: string;
  row_version: number;
};

type WorkLogRow = WorkLogSummaryRow & {
  approved_by_name: string | null;
  notes: string | null;
  details: Array<{
    id: string;
    work_date: string;
    work_type: WorkType;
    start_time: string | null;
    end_time: string | null;
    break_minutes: number;
    work_hours: number;
    overtime_hours: number;
    description: string | null;
    updated_at: string;
    row_version: number;
  }>;
};

type WorkLogListRow = {
  items: WorkLogSummaryRow[];
  next_cursor: {
    work_month: string;
    updated_at: string;
    id: string;
  } | null;
};

export class SupabaseWorkLogRepository implements WorkLogRepository {
  async canRead(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'contract.read' }),
    });
    return (await response.json()) === true;
  }

  async list(
    token: string,
    query: WorkLogListQuery,
  ): Promise<WorkLogListResult> {
    const response = await this.request(token, '/rpc/list_work_log_summaries', {
      method: 'POST',
      body: JSON.stringify({
        p_query: query.query ?? null,
        p_status: query.status ?? null,
        p_work_month: query.workMonth ?? null,
        p_limit: query.limit,
        p_cursor_work_month: query.cursor?.workMonth ?? null,
        p_cursor_updated_at: query.cursor?.updatedAt ?? null,
        p_cursor_id: query.cursor?.id ?? null,
      }),
    });
    const result = (await response.json()) as WorkLogListRow;
    return {
      items: result.items.map(toSummary),
      nextCursor: result.next_cursor
        ? {
            workMonth: result.next_cursor.work_month,
            updatedAt: result.next_cursor.updated_at,
            id: result.next_cursor.id,
          }
        : null,
    };
  }

  async findById(token: string, id: string): Promise<WorkLog | null> {
    const response = await this.request(
      token,
      '/rpc/get_work_log_detail',
      {
        method: 'POST',
        body: JSON.stringify({ p_work_log_id: id }),
      },
      true,
    );
    if (response.status === 403) return null;
    const row = (await response.json()) as WorkLogRow | null;
    return row ? toWorkLog(row) : null;
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
        'Work log data service request failed',
      );
    return response;
  }
}

function toSummary(row: WorkLogSummaryRow): WorkLogSummary {
  return {
    id: row.id,
    contractId: row.contract_id,
    engineerId: row.engineer_id,
    contractTitle: row.contract_title,
    engineerName: row.engineer_name,
    workMonth: row.work_month,
    status: row.status,
    scheduledDays: row.scheduled_days,
    actualDays: row.actual_days,
    scheduledHours: row.scheduled_hours,
    actualHours: row.actual_hours,
    overtimeHours: row.overtime_hours,
    absenceHours: row.absence_hours,
    customerApprovedAt: row.customer_approved_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}

function toWorkLog(row: WorkLogRow): WorkLog {
  return {
    ...toSummary(row),
    approvedByName: row.approved_by_name,
    notes: row.notes,
    details: row.details.map((detail) => ({
      id: detail.id,
      workDate: detail.work_date,
      workType: detail.work_type,
      startTime: detail.start_time,
      endTime: detail.end_time,
      breakMinutes: detail.break_minutes,
      workHours: detail.work_hours,
      overtimeHours: detail.overtime_hours,
      description: detail.description,
      updatedAt: detail.updated_at,
      rowVersion: detail.row_version,
    })),
  };
}
