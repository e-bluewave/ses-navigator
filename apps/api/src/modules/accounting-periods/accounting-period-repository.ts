import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export type AccountingCloseType = 'sales' | 'invoice' | 'payment';
export type AccountingCloseStatus = 'open' | 'closed';

export interface AccountingPeriodSummary {
  id: string;
  periodMonth: string;
  salesStatus: AccountingCloseStatus;
  invoiceStatus: AccountingCloseStatus;
  paymentStatus: AccountingCloseStatus;
  salesClosedAt: string | null;
  invoiceClosedAt: string | null;
  paymentClosedAt: string | null;
  updatedAt: string;
  rowVersion: number;
}

export interface AccountingPeriodStatusHistory {
  id: string;
  closeType: AccountingCloseType;
  fromStatus: AccountingCloseStatus;
  toStatus: AccountingCloseStatus;
  changeReason: string | null;
  impactConfirmed: boolean;
  changedAt: string;
  changedBy: string | null;
}

export interface AccountingPeriod extends AccountingPeriodSummary {
  statusHistories: AccountingPeriodStatusHistory[];
}

export interface AccountingPeriodTransitionInput {
  closeType: AccountingCloseType;
  status: AccountingCloseStatus;
  reason: string | null;
  impactConfirmed: boolean;
}

export interface AccountingPeriodRepository {
  canRead(accessToken: string): Promise<boolean>;
  canManage(accessToken: string): Promise<boolean>;
  list(
    accessToken: string,
    query: { fromMonth?: string; toMonth?: string; limit: number },
  ): Promise<AccountingPeriodSummary[]>;
  findById(accessToken: string, id: string): Promise<AccountingPeriod | null>;
  create(
    accessToken: string,
    periodMonth: string,
    requestId: string,
  ): Promise<AccountingPeriod | null>;
  transitionStatus(
    accessToken: string,
    id: string,
    rowVersion: number,
    input: AccountingPeriodTransitionInput,
    requestId: string,
  ): Promise<AccountingPeriod | null>;
}

type PeriodRow = {
  id: string;
  period_month: string;
  sales_status: AccountingCloseStatus;
  invoice_status: AccountingCloseStatus;
  payment_status: AccountingCloseStatus;
  sales_closed_at: string | null;
  invoice_closed_at: string | null;
  payment_closed_at: string | null;
  updated_at: string;
  row_version: number;
};

type DetailRow = PeriodRow & {
  status_histories: Array<{
    id: string;
    close_type: AccountingCloseType;
    from_status: AccountingCloseStatus;
    to_status: AccountingCloseStatus;
    change_reason: string | null;
    impact_confirmed: boolean;
    changed_at: string;
    changed_by: string | null;
  }>;
};

export class SupabaseAccountingPeriodRepository implements AccountingPeriodRepository {
  async canRead(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'finance.read' }),
    });
    return (await response.json()) === true;
  }

  async canManage(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'finance.manage' }),
    });
    return (await response.json()) === true;
  }

  async list(
    token: string,
    query: { fromMonth?: string; toMonth?: string; limit: number },
  ): Promise<AccountingPeriodSummary[]> {
    const response = await this.request(token, '/rpc/list_accounting_periods', {
      method: 'POST',
      body: JSON.stringify({
        p_from_month: query.fromMonth ?? null,
        p_to_month: query.toMonth ?? null,
        p_limit: query.limit,
      }),
    });
    const result = (await response.json()) as { items: PeriodRow[] };
    return result.items.map(toSummary);
  }

  async findById(token: string, id: string): Promise<AccountingPeriod | null> {
    const response = await this.request(
      token,
      '/rpc/get_accounting_period_detail',
      {
        method: 'POST',
        body: JSON.stringify({ p_accounting_period_id: id }),
      },
      true,
    );
    if (response.status === 403) return null;
    const row = (await response.json()) as DetailRow | null;
    if (!row) return null;
    return {
      ...toSummary(row),
      statusHistories: row.status_histories.map((history) => ({
        id: history.id,
        closeType: history.close_type,
        fromStatus: history.from_status,
        toStatus: history.to_status,
        changeReason: history.change_reason,
        impactConfirmed: history.impact_confirmed,
        changedAt: history.changed_at,
        changedBy: history.changed_by,
      })),
    };
  }

  async create(
    token: string,
    periodMonth: string,
    requestId: string,
  ): Promise<AccountingPeriod | null> {
    const response = await this.request(
      token,
      '/rpc/create_accounting_period',
      {
        method: 'POST',
        body: JSON.stringify({
          p_period_month: periodMonth,
          p_request_id: requestId,
        }),
      },
    );
    const saved = (await response.json()) as PeriodRow | null;
    return saved ? this.findById(token, saved.id) : null;
  }

  async transitionStatus(
    token: string,
    id: string,
    rowVersion: number,
    input: AccountingPeriodTransitionInput,
    requestId: string,
  ): Promise<AccountingPeriod | null> {
    const response = await this.request(
      token,
      '/rpc/transition_accounting_period_status',
      {
        method: 'POST',
        body: JSON.stringify({
          p_accounting_period_id: id,
          p_row_version: rowVersion,
          p_close_type: input.closeType,
          p_to_status: input.status,
          p_reason: input.reason,
          p_impact_confirmed: input.impactConfirmed,
          p_request_id: requestId,
        }),
      },
    );
    const saved = (await response.json()) as PeriodRow | null;
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
        'Accounting period data service request failed',
      );
    return response;
  }
}

function toSummary(row: PeriodRow): AccountingPeriodSummary {
  return {
    id: row.id,
    periodMonth: row.period_month,
    salesStatus: row.sales_status,
    invoiceStatus: row.invoice_status,
    paymentStatus: row.payment_status,
    salesClosedAt: row.sales_closed_at,
    invoiceClosedAt: row.invoice_closed_at,
    paymentClosedAt: row.payment_closed_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}
