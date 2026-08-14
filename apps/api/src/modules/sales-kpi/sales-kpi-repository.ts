import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export interface SalesKpiMonth {
  periodMonth: string;
  proposalCount: number;
  interviewProposalCount: number;
  interviewRate: number | null;
  wonCount: number;
  winRate: number | null;
}
export interface ExpiringContract {
  id: string;
  contractNo: string;
  title: string;
  endDate: string;
  daysRemaining: number;
  status: string;
}
export interface SalesKpiDashboard {
  fromDate: string;
  toDate: string;
  contractExpiryDays: number;
  proposalCount: number;
  interviewProposalCount: number;
  interviewRate: number | null;
  wonCount: number;
  winRate: number | null;
  averageProposalDays: number | null;
  averageInterviewCount: number | null;
  activeProposalCount: number;
  pendingApprovalCount: number;
  scheduledInterviewCount: number;
  expiringContractCount: number;
  monthly: SalesKpiMonth[];
  expiringContracts: ExpiringContract[];
}
export interface SalesKpiRepository {
  canRead(token: string): Promise<boolean>;
  get(
    token: string,
    fromDate: string,
    toDate: string,
    expiryDays: number,
  ): Promise<SalesKpiDashboard>;
}
type Row = Record<string, unknown> & {
  from_date: string;
  to_date: string;
  contract_expiry_days: number;
  proposal_count: number;
  interview_proposal_count: number;
  interview_rate: number | null;
  won_count: number;
  win_rate: number | null;
  average_proposal_days: number | null;
  average_interview_count: number | null;
  active_proposal_count: number;
  pending_approval_count: number;
  scheduled_interview_count: number;
  expiring_contract_count: number;
  monthly: Array<{
    period_month: string;
    proposal_count: number;
    interview_proposal_count: number;
    interview_rate: number | null;
    won_count: number;
    win_rate: number | null;
  }>;
  expiring_contracts: Array<{
    id: string;
    contract_no: string;
    title: string;
    end_date: string;
    days_remaining: number;
    status: string;
  }>;
};
export class SupabaseSalesKpiRepository implements SalesKpiRepository {
  async canRead(token: string) {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'proposal.read' }),
    });
    return (await response.json()) === true;
  }
  async get(
    token: string,
    fromDate: string,
    toDate: string,
    expiryDays: number,
  ) {
    const response = await this.request(token, '/rpc/get_sales_kpi_dashboard', {
      method: 'POST',
      body: JSON.stringify({
        p_from_date: fromDate,
        p_to_date: toDate,
        p_contract_expiry_days: expiryDays,
      }),
    });
    const r = (await response.json()) as Row;
    return {
      fromDate: r.from_date,
      toDate: r.to_date,
      contractExpiryDays: r.contract_expiry_days,
      proposalCount: r.proposal_count,
      interviewProposalCount: r.interview_proposal_count,
      interviewRate: r.interview_rate,
      wonCount: r.won_count,
      winRate: r.win_rate,
      averageProposalDays: r.average_proposal_days,
      averageInterviewCount: r.average_interview_count,
      activeProposalCount: r.active_proposal_count,
      pendingApprovalCount: r.pending_approval_count,
      scheduledInterviewCount: r.scheduled_interview_count,
      expiringContractCount: r.expiring_contract_count,
      monthly: r.monthly.map((m) => ({
        periodMonth: m.period_month,
        proposalCount: m.proposal_count,
        interviewProposalCount: m.interview_proposal_count,
        interviewRate: m.interview_rate,
        wonCount: m.won_count,
        winRate: m.win_rate,
      })),
      expiringContracts: r.expiring_contracts.map((c) => ({
        id: c.id,
        contractNo: c.contract_no,
        title: c.title,
        endDate: c.end_date,
        daysRemaining: c.days_remaining,
        status: c.status,
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
          'content-type': 'application/json',
          accept: 'application/json',
        },
      },
    );
    if (!response.ok)
      throw new ApiError(
        502,
        'upstream_error',
        'Sales KPI data service request failed',
      );
    return response;
  }
}
