import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export type ExpenseType =
  | 'transportation'
  | 'lodging'
  | 'communication'
  | 'equipment'
  | 'meal'
  | 'other';
export type ExpenseStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'invoiced'
  | 'reimbursed'
  | 'cancelled';
export interface ExpenseSummary {
  id: string;
  contractId: string | null;
  workLogId: string | null;
  engineerId: string | null;
  contractNo: string | null;
  contractTitle: string | null;
  engineerName: string | null;
  expenseDate: string;
  expenseType: ExpenseType;
  description: string;
  amount: number;
  taxAmount: number;
  currency: string;
  status: ExpenseStatus;
  billable: boolean;
  invoiceId: string | null;
  approvedAt: string | null;
  updatedAt: string;
  rowVersion: number;
}
export interface ExpenseStatusHistory {
  id: string;
  fromStatus: ExpenseStatus | null;
  toStatus: ExpenseStatus;
  changeReason: string | null;
  changedAt: string;
}
export interface ExpenseApproval {
  id: string;
  status:
    'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
  requestedAt: string | null;
  completedAt: string | null;
  requestNote: string | null;
  decisionNote: string | null;
}
export interface Expense extends ExpenseSummary {
  receiptPath: string | null;
  notes: string | null;
  statusHistories: ExpenseStatusHistory[];
  approval: ExpenseApproval | null;
}
export interface ExpenseInput {
  contractId: string | null;
  workLogId: string | null;
  engineerId: string | null;
  expenseDate: string;
  expenseType: ExpenseType;
  description: string;
  amount: number;
  taxAmount: number;
  currency: string;
  billable: boolean;
  receiptPath: string | null;
  notes: string | null;
}
export interface ExpenseRepository {
  canRead(token: string): Promise<boolean>;
  canManage(token: string): Promise<boolean>;
  list(
    token: string,
    query: {
      q?: string;
      status?: ExpenseStatus;
      dateFrom?: string;
      dateTo?: string;
      limit: number;
    },
  ): Promise<ExpenseSummary[]>;
  findById(token: string, id: string): Promise<Expense | null>;
  save(
    token: string,
    id: string | null,
    rowVersion: number,
    input: ExpenseInput,
    requestId: string,
  ): Promise<Expense | null>;
  transition(
    token: string,
    id: string,
    rowVersion: number,
    status: ExpenseStatus,
    reason: string | null,
    requestId: string,
  ): Promise<Expense | null>;
}

type SummaryRow = {
  id: string;
  contract_id: string | null;
  work_log_id: string | null;
  engineer_id: string | null;
  contract_no: string | null;
  contract_title: string | null;
  engineer_name: string | null;
  expense_date: string;
  expense_type: ExpenseType;
  description: string;
  amount: number;
  tax_amount: number;
  currency: string;
  status: ExpenseStatus;
  billable: boolean;
  invoice_id: string | null;
  approved_at: string | null;
  updated_at: string;
  row_version: number;
};
type DetailRow = SummaryRow & {
  receipt_path: string | null;
  notes: string | null;
  status_histories: Array<{
    id: string;
    from_status: ExpenseStatus | null;
    to_status: ExpenseStatus;
    change_reason: string | null;
    changed_at: string;
  }>;
  approval: null | {
    id: string;
    status: ExpenseApproval['status'];
    requested_at: string | null;
    completed_at: string | null;
    request_note: string | null;
    decision_note: string | null;
  };
};

export class SupabaseExpenseRepository implements ExpenseRepository {
  canRead(token: string) {
    return this.hasPermission(token, 'finance.read');
  }
  canManage(token: string) {
    return this.hasPermission(token, 'finance.manage');
  }
  private async hasPermission(token: string, permission: string) {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: permission }),
    });
    return (await response.json()) === true;
  }
  async list(
    token: string,
    query: {
      q?: string;
      status?: ExpenseStatus;
      dateFrom?: string;
      dateTo?: string;
      limit: number;
    },
  ) {
    const response = await this.request(token, '/rpc/list_expense_records', {
      method: 'POST',
      body: JSON.stringify({
        p_query: query.q ?? null,
        p_status: query.status ?? null,
        p_date_from: query.dateFrom ?? null,
        p_date_to: query.dateTo ?? null,
        p_limit: query.limit,
      }),
    });
    const result = (await response.json()) as { items: SummaryRow[] };
    return result.items.map(toSummary);
  }
  async findById(token: string, id: string) {
    const response = await this.request(
      token,
      '/rpc/get_expense_record_detail',
      { method: 'POST', body: JSON.stringify({ p_expense_id: id }) },
    );
    const row = (await response.json()) as DetailRow | null;
    if (!row) return null;
    return {
      ...toSummary(row),
      receiptPath: row.receipt_path,
      notes: row.notes,
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
  async save(
    token: string,
    id: string | null,
    rowVersion: number,
    input: ExpenseInput,
    requestId: string,
  ) {
    const response = await this.request(token, '/rpc/save_expense_record', {
      method: 'POST',
      body: JSON.stringify({
        p_expense_id: id,
        p_row_version: rowVersion,
        p_expense: snakeInput(input),
        p_request_id: requestId,
      }),
    });
    const saved = (await response.json()) as { id: string } | null;
    return saved ? this.findById(token, saved.id) : null;
  }
  async transition(
    token: string,
    id: string,
    rowVersion: number,
    status: ExpenseStatus,
    reason: string | null,
    requestId: string,
  ) {
    const response = await this.request(
      token,
      '/rpc/transition_expense_status',
      {
        method: 'POST',
        body: JSON.stringify({
          p_expense_id: id,
          p_row_version: rowVersion,
          p_to_status: status,
          p_reason: reason,
          p_request_id: requestId,
        }),
      },
    );
    const saved = (await response.json()) as { id: string } | null;
    return saved ? this.findById(token, saved.id) : null;
  }
  private async request(token: string, path: string, init: RequestInit = {}) {
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
    if (!response.ok)
      throw new ApiError(
        502,
        'upstream_error',
        'Expense data service request failed',
      );
    return response;
  }
}
function toSummary(row: SummaryRow): ExpenseSummary {
  return {
    id: row.id,
    contractId: row.contract_id,
    workLogId: row.work_log_id,
    engineerId: row.engineer_id,
    contractNo: row.contract_no,
    contractTitle: row.contract_title,
    engineerName: row.engineer_name,
    expenseDate: row.expense_date,
    expenseType: row.expense_type,
    description: row.description,
    amount: row.amount,
    taxAmount: row.tax_amount,
    currency: row.currency,
    status: row.status,
    billable: row.billable,
    invoiceId: row.invoice_id,
    approvedAt: row.approved_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}
function snakeInput(input: ExpenseInput) {
  return {
    contract_id: input.contractId,
    work_log_id: input.workLogId,
    engineer_id: input.engineerId,
    expense_date: input.expenseDate,
    expense_type: input.expenseType,
    description: input.description,
    amount: input.amount,
    tax_amount: input.taxAmount,
    currency: input.currency,
    billable: input.billable,
    receipt_path: input.receiptPath,
    notes: input.notes,
  };
}
