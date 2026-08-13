import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export type ContractType =
  | 'ses'
  | 'dispatch'
  | 'subcontract'
  | 'quasi_mandate'
  | 'fixed_price'
  | 'other';

export type ContractStatus =
  | 'draft'
  | 'review'
  | 'active'
  | 'suspended'
  | 'expired'
  | 'terminated'
  | 'cancelled';

export type ContractPartyRole =
  | 'customer'
  | 'supplier'
  | 'employer'
  | 'end_client'
  | 'prime_contractor'
  | 'subcontractor'
  | 'other';

export type ContractBillingRole = 'bill_to' | 'pay_to' | 'none';

export interface ContractSummary {
  id: string;
  contractNo: string;
  projectId: string | null;
  proposalId: string | null;
  engineerId: string | null;
  contractType: ContractType;
  status: ContractStatus;
  title: string;
  startDate: string;
  endDate: string | null;
  autoRenew: boolean;
  currency: string;
  updatedAt: string;
  rowVersion: number;
}

export interface ContractParty {
  id: string;
  companyId: string;
  contactId: string | null;
  partyRole: ContractPartyRole;
  billingRole: ContractBillingRole | null;
  isPrimary: boolean;
}

export interface ContractApproval {
  id: string;
  status:
    'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
  requestedAt: string | null;
  completedAt: string | null;
  requestNote: string | null;
  decisionNote: string | null;
  rowVersion: number;
}

export interface ContractVersion {
  id: string;
  versionNo: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  changeSummary: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface ContractWorkLog {
  id: string;
  engineerId: string;
  workMonth: string;
  status: string;
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

export interface Contract extends ContractSummary {
  monthlyAmount: number | null;
  hourlyAmount: number | null;
  settlementLowerHours: number | null;
  settlementUpperHours: number | null;
  paymentTerms: string | null;
  notes: string | null;
  parties: ContractParty[];
  versions: ContractVersion[];
  workLogs: ContractWorkLog[];
  approval: ContractApproval | null;
}

export interface ContractInput {
  contractNo: string;
  projectId: string | null;
  proposalId: string | null;
  engineerId: string | null;
  contractType: ContractType;
  title: string;
  startDate: string;
  endDate: string | null;
  autoRenew: boolean;
  currency: string;
  monthlyAmount: number | null;
  hourlyAmount: number | null;
  settlementLowerHours: number | null;
  settlementUpperHours: number | null;
  paymentTerms: string | null;
  notes: string | null;
  parties: Array<Omit<ContractParty, 'id'>>;
  changeSummary: string | null;
}

export interface ContractListQuery {
  limit: number;
  cursor?: { updatedAt: string; id: string };
  query?: string;
  status?: ContractStatus;
}

export interface ContractListResult {
  items: ContractSummary[];
  nextCursor: { updatedAt: string; id: string } | null;
}

export interface ContractRepository {
  canRead(accessToken: string): Promise<boolean>;
  canManage(accessToken: string): Promise<boolean>;
  canApprove(accessToken: string): Promise<boolean>;
  list(
    accessToken: string,
    query: ContractListQuery,
  ): Promise<ContractListResult>;
  findById(accessToken: string, id: string): Promise<Contract | null>;
  create(
    accessToken: string,
    input: ContractInput,
    requestId: string,
  ): Promise<Contract | null>;
  update(
    accessToken: string,
    id: string,
    rowVersion: number,
    input: ContractInput,
    requestId: string,
  ): Promise<Contract | null>;
  transitionStatus(
    accessToken: string,
    id: string,
    rowVersion: number,
    status: 'draft' | 'review' | 'active',
    reason: string | null,
    requestId: string,
  ): Promise<Contract | null>;
}

type ContractSummaryRow = {
  id: string;
  contract_no: string;
  project_id: string | null;
  proposal_id: string | null;
  engineer_id: string | null;
  contract_type: ContractType;
  status: ContractStatus;
  title: string;
  start_date: string;
  end_date: string | null;
  auto_renew: boolean;
  currency: string;
  updated_at: string;
  row_version: number;
};

type ContractDetailRow = ContractSummaryRow & {
  monthly_amount: number | null;
  hourly_amount: number | null;
  settlement_lower_hours: number | null;
  settlement_upper_hours: number | null;
  payment_terms: string | null;
  notes: string | null;
  parties: Array<{
    id: string;
    company_id: string;
    contact_id: string | null;
    party_role: ContractPartyRole;
    billing_role: ContractBillingRole | null;
    is_primary: boolean;
  }>;
  versions: Array<{
    id: string;
    version_no: number;
    effective_from: string;
    effective_to: string | null;
    change_summary: string | null;
    approved_at: string | null;
    created_at: string;
  }>;
  work_logs: Array<{
    id: string;
    engineer_id: string;
    work_month: string;
    status: string;
    scheduled_days: number | null;
    actual_days: number | null;
    scheduled_hours: number | null;
    actual_hours: number | null;
    overtime_hours: number;
    absence_hours: number;
    customer_approved_at: string | null;
    updated_at: string;
    row_version: number;
  }>;
  approval: {
    id: string;
    status: ContractApproval['status'];
    requested_at: string | null;
    completed_at: string | null;
    request_note: string | null;
    decision_note: string | null;
    row_version: number;
  } | null;
};

const summarySelect =
  'id,contract_no,project_id,proposal_id,engineer_id,contract_type,status,title,start_date,end_date,auto_renew,currency,updated_at,row_version';

export class SupabaseContractRepository implements ContractRepository {
  async canRead(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'contract.read' }),
    });
    return (await response.json()) === true;
  }

  async canManage(token: string): Promise<boolean> {
    return this.hasPermission(token, 'contract.manage');
  }

  async canApprove(token: string): Promise<boolean> {
    return this.hasPermission(token, 'contract.approve');
  }

  async list(
    token: string,
    query: ContractListQuery,
  ): Promise<ContractListResult> {
    const params = new URLSearchParams({
      select: summarySelect,
      order: 'updated_at.desc,id.desc',
      limit: String(query.limit + 1),
    });
    if (query.query !== undefined) {
      const escaped = escapeFilterValue(query.query);
      params.set(
        'or',
        `(contract_no.ilike.*${escaped}*,title.ilike.*${escaped}*)`,
      );
    }
    if (query.status !== undefined) params.set('status', `eq.${query.status}`);
    if (query.cursor !== undefined)
      params.set(
        'and',
        `(or(updated_at.lt.${query.cursor.updatedAt},and(updated_at.eq.${query.cursor.updatedAt},id.lt.${query.cursor.id})))`,
      );
    const response = await this.request(
      token,
      `/contract_summaries?${params.toString()}`,
    );
    const rows = (await response.json()) as ContractSummaryRow[];
    const visible = rows.slice(0, query.limit);
    const last = visible.at(-1);
    return {
      items: visible.map(toContractSummary),
      nextCursor:
        rows.length > query.limit && last
          ? { updatedAt: last.updated_at, id: last.id }
          : null,
    };
  }

  async findById(token: string, id: string): Promise<Contract | null> {
    const response = await this.request(
      token,
      '/rpc/get_contract_detail',
      {
        method: 'POST',
        body: JSON.stringify({ p_contract_id: id }),
      },
      true,
    );
    if (response.status === 403) return null;
    const row = (await response.json()) as ContractDetailRow | null;
    return row ? toContract(row) : null;
  }

  async create(
    token: string,
    input: ContractInput,
    requestId: string,
  ): Promise<Contract | null> {
    return this.save(token, null, 0, input, requestId);
  }

  async update(
    token: string,
    id: string,
    rowVersion: number,
    input: ContractInput,
    requestId: string,
  ): Promise<Contract | null> {
    return this.save(token, id, rowVersion, input, requestId);
  }

  async transitionStatus(
    token: string,
    id: string,
    rowVersion: number,
    status: 'draft' | 'review' | 'active',
    reason: string | null,
    requestId: string,
  ): Promise<Contract | null> {
    const response = await this.request(
      token,
      '/rpc/transition_contract_status',
      {
        method: 'POST',
        body: JSON.stringify({
          p_contract_id: id,
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

  private async save(
    token: string,
    id: string | null,
    rowVersion: number,
    input: ContractInput,
    requestId: string,
  ): Promise<Contract | null> {
    const response = await this.request(token, '/rpc/save_contract', {
      method: 'POST',
      body: JSON.stringify({
        p_contract_id: id,
        p_row_version: rowVersion,
        p_contract: {
          contract_no: input.contractNo,
          project_id: input.projectId,
          proposal_id: input.proposalId,
          engineer_id: input.engineerId,
          contract_type: input.contractType,
          title: input.title,
          start_date: input.startDate,
          end_date: input.endDate,
          auto_renew: input.autoRenew,
          currency: input.currency,
          monthly_amount: input.monthlyAmount,
          hourly_amount: input.hourlyAmount,
          settlement_lower_hours: input.settlementLowerHours,
          settlement_upper_hours: input.settlementUpperHours,
          payment_terms: input.paymentTerms,
          notes: input.notes,
        },
        p_parties: input.parties.map((party) => ({
          company_id: party.companyId,
          contact_id: party.contactId,
          party_role: party.partyRole,
          billing_role: party.billingRole,
          is_primary: party.isPrimary,
        })),
        p_change_summary: input.changeSummary,
        p_request_id: requestId,
      }),
    });
    const saved = (await response.json()) as { id: string } | null;
    return saved ? this.findById(token, saved.id) : null;
  }

  private async hasPermission(token: string, permission: string) {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: permission }),
    });
    return (await response.json()) === true;
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
        'Contract data service request failed',
      );
    return response;
  }
}

function toContractSummary(row: ContractSummaryRow): ContractSummary {
  return {
    id: row.id,
    contractNo: row.contract_no,
    projectId: row.project_id,
    proposalId: row.proposal_id,
    engineerId: row.engineer_id,
    contractType: row.contract_type,
    status: row.status,
    title: row.title,
    startDate: row.start_date,
    endDate: row.end_date,
    autoRenew: row.auto_renew,
    currency: row.currency,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}

function toContract(row: ContractDetailRow): Contract {
  return {
    ...toContractSummary(row),
    monthlyAmount: row.monthly_amount,
    hourlyAmount: row.hourly_amount,
    settlementLowerHours: row.settlement_lower_hours,
    settlementUpperHours: row.settlement_upper_hours,
    paymentTerms: row.payment_terms,
    notes: row.notes,
    parties: row.parties.map((party) => ({
      id: party.id,
      companyId: party.company_id,
      contactId: party.contact_id,
      partyRole: party.party_role,
      billingRole: party.billing_role,
      isPrimary: party.is_primary,
    })),
    versions: row.versions.map((version) => ({
      id: version.id,
      versionNo: version.version_no,
      effectiveFrom: version.effective_from,
      effectiveTo: version.effective_to,
      changeSummary: version.change_summary,
      approvedAt: version.approved_at,
      createdAt: version.created_at,
    })),
    workLogs: row.work_logs.map((workLog) => ({
      id: workLog.id,
      engineerId: workLog.engineer_id,
      workMonth: workLog.work_month,
      status: workLog.status,
      scheduledDays: workLog.scheduled_days,
      actualDays: workLog.actual_days,
      scheduledHours: workLog.scheduled_hours,
      actualHours: workLog.actual_hours,
      overtimeHours: workLog.overtime_hours,
      absenceHours: workLog.absence_hours,
      customerApprovedAt: workLog.customer_approved_at,
      updatedAt: workLog.updated_at,
      rowVersion: workLog.row_version,
    })),
    approval: row.approval
      ? {
          id: row.approval.id,
          status: row.approval.status,
          requestedAt: row.approval.requested_at,
          completedAt: row.approval.completed_at,
          requestNote: row.approval.request_note,
          decisionNote: row.approval.decision_note,
          rowVersion: row.approval.row_version,
        }
      : null,
  };
}

function escapeFilterValue(value: string): string {
  return value.replace(/[\\*,().]/g, (character) => `\\${character}`);
}
