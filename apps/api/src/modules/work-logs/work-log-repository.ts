import { dataApiSchemaHeaders } from '../../shared/supabase-schema.js';
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

export interface WorkLogStatusHistory {
  id: string;
  fromStatus: WorkLogStatus | null;
  toStatus: WorkLogStatus;
  changeReason: string | null;
  changedAt: string;
}

export interface WorkLogApproval {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string | null;
  completedAt: string | null;
  requestNote: string | null;
  decisionNote: string | null;
}

export interface WorkLog extends WorkLogSummary {
  approvedByName: string | null;
  notes: string | null;
  details: WorkLogDetailItem[];
  statusHistories: WorkLogStatusHistory[];
  approval: WorkLogApproval | null;
}

export interface WorkLogInput {
  contractId: string;
  engineerId: string;
  workMonth: string;
  scheduledDays: number | null;
  scheduledHours: number | null;
  absenceHours: number;
  notes: string | null;
  details: Array<Omit<WorkLogDetailItem, 'id' | 'updatedAt' | 'rowVersion'>>;
}

export interface WorkLogStatusTransitionInput {
  status: Exclude<WorkLogStatus, 'draft'>;
  reason: string | null;
  approvedByName: string | null;
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
  canManage(accessToken: string): Promise<boolean>;
  canApprove(accessToken: string): Promise<boolean>;
  list(
    accessToken: string,
    query: WorkLogListQuery,
  ): Promise<WorkLogListResult>;
  findById(accessToken: string, id: string): Promise<WorkLog | null>;
  create(
    accessToken: string,
    input: WorkLogInput,
    requestId: string,
  ): Promise<WorkLog | null>;
  update(
    accessToken: string,
    id: string,
    rowVersion: number,
    input: WorkLogInput,
    requestId: string,
  ): Promise<WorkLog | null>;
  transitionStatus(
    accessToken: string,
    id: string,
    rowVersion: number,
    input: WorkLogStatusTransitionInput,
    requestId: string,
  ): Promise<WorkLog | null>;
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
  status_histories: Array<{
    id: string;
    from_status: WorkLogStatus | null;
    to_status: WorkLogStatus;
    change_reason: string | null;
    changed_at: string;
  }>;
  approval: {
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    requested_at: string | null;
    completed_at: string | null;
    request_note: string | null;
    decision_note: string | null;
  } | null;
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

  async canManage(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'contract.manage' }),
    });
    return (await response.json()) === true;
  }

  async canApprove(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'contract.approve' }),
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

  async create(
    token: string,
    input: WorkLogInput,
    requestId: string,
  ): Promise<WorkLog | null> {
    return this.save(token, null, 0, input, requestId);
  }

  async update(
    token: string,
    id: string,
    rowVersion: number,
    input: WorkLogInput,
    requestId: string,
  ): Promise<WorkLog | null> {
    return this.save(token, id, rowVersion, input, requestId);
  }

  async transitionStatus(
    token: string,
    id: string,
    rowVersion: number,
    input: WorkLogStatusTransitionInput,
    requestId: string,
  ): Promise<WorkLog | null> {
    const response = await this.request(
      token,
      '/rpc/transition_work_log_status',
      {
        method: 'POST',
        body: JSON.stringify({
          p_work_log_id: id,
          p_row_version: rowVersion,
          p_to_status: input.status,
          p_reason: input.reason,
          p_approved_by_name: input.approvedByName,
          p_request_id: requestId,
        }),
      },
    );
    const saved = (await response.json()) as { id: string } | null;
    return saved ? this.findById(token, saved.id) : null;
  }

  private async save(
    token: string,
    id: string | null,
    rowVersion: number,
    input: WorkLogInput,
    requestId: string,
  ): Promise<WorkLog | null> {
    const response = await this.request(token, '/rpc/save_work_log', {
      method: 'POST',
      body: JSON.stringify({
        p_work_log_id: id,
        p_row_version: rowVersion,
        p_work_log: {
          contract_id: input.contractId,
          engineer_id: input.engineerId,
          work_month: input.workMonth,
          scheduled_days: input.scheduledDays,
          scheduled_hours: input.scheduledHours,
          absence_hours: input.absenceHours,
          notes: input.notes,
        },
        p_details: input.details.map((detail) => ({
          work_date: detail.workDate,
          work_type: detail.workType,
          start_time: detail.startTime,
          end_time: detail.endTime,
          break_minutes: detail.breakMinutes,
          work_hours: detail.workHours,
          overtime_hours: detail.overtimeHours,
          description: detail.description,
        })),
        p_request_id: requestId,
      }),
    });
    const saved = (await response.json()) as { id: string } | null;
    return saved ? this.findById(token, saved.id) : null;
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
          ...dataApiSchemaHeaders(path),
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
    statusHistories: row.status_histories.map((history) => ({
      id: history.id,
      fromStatus: history.from_status,
      toStatus: history.to_status,
      changeReason: history.change_reason,
      changedAt: history.changed_at,
    })),
    approval: row.approval
      ? {
          id: row.approval.id,
          status: row.approval.status,
          requestedAt: row.approval.requested_at,
          completedAt: row.approval.completed_at,
          requestNote: row.approval.request_note,
          decisionNote: row.approval.decision_note,
        }
      : null,
  };
}
