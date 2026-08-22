import { dataApiSchemaHeaders } from '../../shared/supabase-schema.js';
import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export type AccountingExportFormat =
  'generic_csv' | 'freee' | 'money_forward' | 'yayoi';
export type AccountingExportStatus = 'generated' | 'exported' | 'cancelled';

export interface AccountingExportBatchSummary {
  id: string;
  accountingPeriodId: string;
  periodMonth: string;
  versionNo: number;
  exportFormat: AccountingExportFormat;
  status: AccountingExportStatus;
  generatedAt: string;
  exportedAt: string | null;
  exportReference: string | null;
  lineCount: number;
  debitTotal: number;
  creditTotal: number;
  updatedAt: string;
  rowVersion: number;
}

export interface AccountingExportLine {
  id: string;
  lineNo: number;
  entryDate: string;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  currency: string;
  description: string;
  sourceType: 'invoice' | 'payment';
  sourceId: string;
}

export interface AccountingExportBatch extends AccountingExportBatchSummary {
  lines: AccountingExportLine[];
}

export interface AccountingExportRepository {
  canRead(token: string): Promise<boolean>;
  canManage(token: string): Promise<boolean>;
  list(
    token: string,
    query: { accountingPeriodId?: string; limit: number },
  ): Promise<AccountingExportBatchSummary[]>;
  findById(token: string, id: string): Promise<AccountingExportBatch | null>;
  generate(
    token: string,
    accountingPeriodId: string,
    exportFormat: AccountingExportFormat,
    requestId: string,
  ): Promise<AccountingExportBatch | null>;
  markExported(
    token: string,
    id: string,
    rowVersion: number,
    exportReference: string | null,
    requestId: string,
  ): Promise<AccountingExportBatch | null>;
}

type SummaryRow = {
  id: string;
  accounting_period_id: string;
  period_month: string;
  version_no: number;
  export_format: AccountingExportFormat;
  status: AccountingExportStatus;
  generated_at: string;
  exported_at: string | null;
  export_reference: string | null;
  line_count: number;
  debit_total: number;
  credit_total: number;
  updated_at: string;
  row_version: number;
};
type DetailRow = SummaryRow & {
  lines: Array<{
    id: string;
    line_no: number;
    entry_date: string;
    account_code: string;
    account_name: string;
    debit_amount: number;
    credit_amount: number;
    currency: string;
    description: string;
    source_type: 'invoice' | 'payment';
    source_id: string;
  }>;
};

export class SupabaseAccountingExportRepository implements AccountingExportRepository {
  async canRead(token: string) {
    return this.hasPermission(token, 'finance.read');
  }
  async canManage(token: string) {
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
    query: { accountingPeriodId?: string; limit: number },
  ) {
    const response = await this.request(
      token,
      '/rpc/list_accounting_export_batches',
      {
        method: 'POST',
        body: JSON.stringify({
          p_accounting_period_id: query.accountingPeriodId ?? null,
          p_limit: query.limit,
        }),
      },
    );
    const result = (await response.json()) as { items: SummaryRow[] };
    return result.items.map(toSummary);
  }
  async findById(token: string, id: string) {
    const response = await this.request(
      token,
      '/rpc/get_accounting_export_batch_detail',
      {
        method: 'POST',
        body: JSON.stringify({ p_export_batch_id: id }),
      },
      true,
    );
    if (response.status === 403) return null;
    const row = (await response.json()) as DetailRow | null;
    return row
      ? {
          ...toSummary(row),
          lines: row.lines.map((line) => ({
            id: line.id,
            lineNo: line.line_no,
            entryDate: line.entry_date,
            accountCode: line.account_code,
            accountName: line.account_name,
            debitAmount: line.debit_amount,
            creditAmount: line.credit_amount,
            currency: line.currency,
            description: line.description,
            sourceType: line.source_type,
            sourceId: line.source_id,
          })),
        }
      : null;
  }
  async generate(
    token: string,
    accountingPeriodId: string,
    exportFormat: AccountingExportFormat,
    requestId: string,
  ) {
    const response = await this.request(
      token,
      '/rpc/generate_accounting_export_batch',
      {
        method: 'POST',
        body: JSON.stringify({
          p_accounting_period_id: accountingPeriodId,
          p_export_format: exportFormat,
          p_request_id: requestId,
        }),
      },
    );
    const saved = (await response.json()) as { id: string } | null;
    return saved ? this.findById(token, saved.id) : null;
  }
  async markExported(
    token: string,
    id: string,
    rowVersion: number,
    exportReference: string | null,
    requestId: string,
  ) {
    const response = await this.request(
      token,
      '/rpc/mark_accounting_export_batch_exported',
      {
        method: 'POST',
        body: JSON.stringify({
          p_export_batch_id: id,
          p_row_version: rowVersion,
          p_export_reference: exportReference,
          p_request_id: requestId,
        }),
      },
    );
    const saved = (await response.json()) as { id: string } | null;
    return saved ? this.findById(token, saved.id) : null;
  }
  private async request(
    token: string,
    path: string,
    init: RequestInit = {},
    hideForbidden = false,
  ) {
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
        'Accounting export data service request failed',
      );
    return response;
  }
}

function toSummary(row: SummaryRow): AccountingExportBatchSummary {
  return {
    id: row.id,
    accountingPeriodId: row.accounting_period_id,
    periodMonth: row.period_month,
    versionNo: row.version_no,
    exportFormat: row.export_format,
    status: row.status,
    generatedAt: row.generated_at,
    exportedAt: row.exported_at,
    exportReference: row.export_reference,
    lineCount: row.line_count,
    debitTotal: row.debit_total,
    creditTotal: row.credit_total,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}
