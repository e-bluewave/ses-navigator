import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export type InvoiceStatus =
  | 'draft'
  | 'issued'
  | 'sent'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'void';
export type InvoiceType = 'sales' | 'purchase';

export interface InvoiceSummary {
  id: string;
  invoiceNo: string;
  invoiceType: InvoiceType;
  contractId: string | null;
  contractTitle: string | null;
  billingCompanyId: string;
  billingCompanyName: string;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  currency: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  sentAt: string | null;
  updatedAt: string;
  rowVersion: number;
}

export interface Invoice extends InvoiceSummary {
  billingAccount: {
    id: string;
    companyId: string;
    accountType: 'receivable' | 'payable' | 'both';
    accountName: string;
    closingDay: number | null;
    paymentMonthOffset: number;
    paymentDay: number | null;
    invoiceDeliveryMethod: 'email' | 'postal' | 'portal' | 'edi' | 'other';
    isDefault: boolean;
  };
  items: Array<{
    id: string;
    lineNo: number;
    itemType:
      | 'service'
      | 'expense'
      | 'adjustment'
      | 'discount'
      | 'tax_exempt'
      | 'other';
    description: string;
    quantity: number;
    unit: string | null;
    unitPrice: number;
    taxRate: number;
    amount: number;
    taxAmount: number;
    workLogId: string | null;
    displayOrder: number;
  }>;
  payments: Array<{
    id: string;
    paymentType: 'receipt' | 'payment' | 'refund' | 'offset' | 'other';
    paymentDate: string;
    amount: number;
    currency: string;
    paymentMethod: string | null;
    bankFeeAmount: number;
  }>;
}

export interface InvoiceListQuery {
  limit: number;
  cursor?: { issueDate: string; updatedAt: string; id: string };
  query?: string;
  status?: InvoiceStatus;
  invoiceType?: InvoiceType;
  dueFrom?: string;
  dueTo?: string;
}

export interface InvoiceListResult {
  items: InvoiceSummary[];
  nextCursor: { issueDate: string; updatedAt: string; id: string } | null;
}

export interface InvoiceRepository {
  canRead(accessToken: string): Promise<boolean>;
  list(
    accessToken: string,
    query: InvoiceListQuery,
  ): Promise<InvoiceListResult>;
  findById(accessToken: string, id: string): Promise<Invoice | null>;
}

type SummaryRow = {
  id: string;
  invoice_no: string;
  invoice_type: InvoiceType;
  contract_id: string | null;
  contract_title: string | null;
  billing_company_id: string;
  billing_company_name: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  currency: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  sent_at: string | null;
  updated_at: string;
  row_version: number;
};
type DetailRow = SummaryRow & {
  billing_account: {
    id: string;
    company_id: string;
    account_type: 'receivable' | 'payable' | 'both';
    account_name: string;
    closing_day: number | null;
    payment_month_offset: number;
    payment_day: number | null;
    invoice_delivery_method: 'email' | 'postal' | 'portal' | 'edi' | 'other';
    is_default: boolean;
  };
  items: Array<{
    id: string;
    line_no: number;
    item_type: Invoice['items'][number]['itemType'];
    description: string;
    quantity: number;
    unit: string | null;
    unit_price: number;
    tax_rate: number;
    amount: number;
    tax_amount: number;
    work_log_id: string | null;
    display_order: number;
  }>;
  payments: Array<{
    id: string;
    payment_type: Invoice['payments'][number]['paymentType'];
    payment_date: string;
    amount: number;
    currency: string;
    payment_method: string | null;
    bank_fee_amount: number;
  }>;
};

export class SupabaseInvoiceRepository implements InvoiceRepository {
  async canRead(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'finance.read' }),
    });
    return (await response.json()) === true;
  }

  async list(
    token: string,
    query: InvoiceListQuery,
  ): Promise<InvoiceListResult> {
    const response = await this.request(token, '/rpc/list_invoice_summaries', {
      method: 'POST',
      body: JSON.stringify({
        p_query: query.query ?? null,
        p_status: query.status ?? null,
        p_invoice_type: query.invoiceType ?? null,
        p_due_from: query.dueFrom ?? null,
        p_due_to: query.dueTo ?? null,
        p_limit: query.limit,
        p_cursor_issue_date: query.cursor?.issueDate ?? null,
        p_cursor_updated_at: query.cursor?.updatedAt ?? null,
        p_cursor_id: query.cursor?.id ?? null,
      }),
    });
    const result = (await response.json()) as {
      items: SummaryRow[];
      next_cursor: {
        issue_date: string;
        updated_at: string;
        id: string;
      } | null;
    };
    return {
      items: result.items.map(toSummary),
      nextCursor: result.next_cursor
        ? {
            issueDate: result.next_cursor.issue_date,
            updatedAt: result.next_cursor.updated_at,
            id: result.next_cursor.id,
          }
        : null,
    };
  }

  async findById(token: string, id: string): Promise<Invoice | null> {
    const response = await this.request(
      token,
      '/rpc/get_invoice_detail',
      {
        method: 'POST',
        body: JSON.stringify({ p_invoice_id: id }),
      },
      true,
    );
    if (response.status === 403) return null;
    const row = (await response.json()) as DetailRow | null;
    return row
      ? {
          ...toSummary(row),
          billingAccount: {
            id: row.billing_account.id,
            companyId: row.billing_account.company_id,
            accountType: row.billing_account.account_type,
            accountName: row.billing_account.account_name,
            closingDay: row.billing_account.closing_day,
            paymentMonthOffset: row.billing_account.payment_month_offset,
            paymentDay: row.billing_account.payment_day,
            invoiceDeliveryMethod: row.billing_account.invoice_delivery_method,
            isDefault: row.billing_account.is_default,
          },
          items: row.items.map((item) => ({
            id: item.id,
            lineNo: item.line_no,
            itemType: item.item_type,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unit_price,
            taxRate: item.tax_rate,
            amount: item.amount,
            taxAmount: item.tax_amount,
            workLogId: item.work_log_id,
            displayOrder: item.display_order,
          })),
          payments: row.payments.map((payment) => ({
            id: payment.id,
            paymentType: payment.payment_type,
            paymentDate: payment.payment_date,
            amount: payment.amount,
            currency: payment.currency,
            paymentMethod: payment.payment_method,
            bankFeeAmount: payment.bank_fee_amount,
          })),
        }
      : null;
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
        'Invoice data service request failed',
      );
    return response;
  }
}

function toSummary(row: SummaryRow): InvoiceSummary {
  return {
    id: row.id,
    invoiceNo: row.invoice_no,
    invoiceType: row.invoice_type,
    contractId: row.contract_id,
    contractTitle: row.contract_title,
    billingCompanyId: row.billing_company_id,
    billingCompanyName: row.billing_company_name,
    billingPeriodStart: row.billing_period_start,
    billingPeriodEnd: row.billing_period_end,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    status: row.status,
    currency: row.currency,
    subtotal: row.subtotal,
    taxAmount: row.tax_amount,
    totalAmount: row.total_amount,
    paidAmount: row.paid_amount,
    balanceAmount: row.balance_amount,
    sentAt: row.sent_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}
