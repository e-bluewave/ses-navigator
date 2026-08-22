import { dataApiSchemaHeaders } from '../../shared/supabase-schema.js';
import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export interface ProfitabilityMonth {
  periodMonth: string;
  revenue: number;
  purchaseCost: number;
  expenseCost: number;
  grossProfit: number;
  grossMarginRate: number | null;
  cashIn: number;
  cashOut: number;
  receivableBalance: number;
  payableBalance: number;
  salesInvoiceCount: number;
  purchaseInvoiceCount: number;
  expenseCount: number;
}
export interface ProfitabilityDashboard {
  fromMonth: string;
  toMonth: string;
  currency: string;
  revenue: number;
  purchaseCost: number;
  expenseCost: number;
  grossProfit: number;
  grossMarginRate: number | null;
  cashIn: number;
  cashOut: number;
  receivableBalance: number;
  payableBalance: number;
  monthly: ProfitabilityMonth[];
}
export interface ProfitabilityRepository {
  canRead(token: string): Promise<boolean>;
  get(
    token: string,
    fromMonth: string,
    toMonth: string,
    currency: string,
  ): Promise<ProfitabilityDashboard>;
}
type Row = {
  from_month: string;
  to_month: string;
  currency: string;
  revenue: number;
  purchase_cost: number;
  expense_cost: number;
  gross_profit: number;
  gross_margin_rate: number | null;
  cash_in: number;
  cash_out: number;
  receivable_balance: number;
  payable_balance: number;
  monthly: Array<{
    period_month: string;
    revenue: number;
    purchase_cost: number;
    expense_cost: number;
    gross_profit: number;
    gross_margin_rate: number | null;
    cash_in: number;
    cash_out: number;
    receivable_balance: number;
    payable_balance: number;
    sales_invoice_count: number;
    purchase_invoice_count: number;
    expense_count: number;
  }>;
};
export class SupabaseProfitabilityRepository implements ProfitabilityRepository {
  async canRead(token: string) {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'finance.read' }),
    });
    return (await response.json()) === true;
  }
  async get(
    token: string,
    fromMonth: string,
    toMonth: string,
    currency: string,
  ) {
    const response = await this.request(
      token,
      '/rpc/get_profitability_dashboard',
      {
        method: 'POST',
        body: JSON.stringify({
          p_from_month: fromMonth,
          p_to_month: toMonth,
          p_currency: currency,
        }),
      },
    );
    const row = (await response.json()) as Row;
    return {
      fromMonth: row.from_month,
      toMonth: row.to_month,
      currency: row.currency,
      revenue: row.revenue,
      purchaseCost: row.purchase_cost,
      expenseCost: row.expense_cost,
      grossProfit: row.gross_profit,
      grossMarginRate: row.gross_margin_rate,
      cashIn: row.cash_in,
      cashOut: row.cash_out,
      receivableBalance: row.receivable_balance,
      payableBalance: row.payable_balance,
      monthly: row.monthly.map((m) => ({
        periodMonth: m.period_month,
        revenue: m.revenue,
        purchaseCost: m.purchase_cost,
        expenseCost: m.expense_cost,
        grossProfit: m.gross_profit,
        grossMarginRate: m.gross_margin_rate,
        cashIn: m.cash_in,
        cashOut: m.cash_out,
        receivableBalance: m.receivable_balance,
        payableBalance: m.payable_balance,
        salesInvoiceCount: m.sales_invoice_count,
        purchaseInvoiceCount: m.purchase_invoice_count,
        expenseCount: m.expense_count,
      })),
    };
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
        'Profitability data service request failed',
      );
    return response;
  }
}
