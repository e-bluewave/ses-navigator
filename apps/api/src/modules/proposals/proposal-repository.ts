import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export interface Proposal {
  id: string;
  managementNo: string;
  projectPositionId: string;
  engineerId: string;
  destinationCompanyId: string;
  destinationContactId: string | null;
  resumeVersionId: string | null;
  requirementVersionId: string | null;
  proposedUnitPrice: number | null;
  currencyCode: string;
  status: string;
  proposedStartDate: string | null;
  validityDate: string | null;
  updatedAt: string;
  rowVersion: number;
}

export interface ProposalListQuery {
  limit: number;
  cursor?: { updatedAt: string; id: string };
  query?: string;
  status?: string;
}

export interface ProposalListResult {
  items: Proposal[];
  nextCursor: { updatedAt: string; id: string } | null;
}

export interface ProposalInput {
  managementNo: string;
  projectPositionId: string;
  engineerId: string;
  destinationCompanyId: string;
  destinationContactId: string | null;
  resumeVersionId: string | null;
  requirementVersionId: string | null;
  proposedUnitPrice: number | null;
  currencyCode: string;
  proposedStartDate: string | null;
  validityDate: string | null;
}

export interface ProposalRepository {
  canRead(accessToken: string): Promise<boolean>;
  canManage(accessToken: string): Promise<boolean>;
  canSend(accessToken: string): Promise<boolean>;
  list(
    accessToken: string,
    query: ProposalListQuery,
  ): Promise<ProposalListResult>;
  findById(accessToken: string, id: string): Promise<Proposal | null>;
  create(
    accessToken: string,
    input: ProposalInput,
    requestId: string,
  ): Promise<Proposal | null>;
  update(
    accessToken: string,
    id: string,
    rowVersion: number,
    input: ProposalInput,
    requestId: string,
  ): Promise<Proposal | null>;
  transitionStatus(
    accessToken: string,
    id: string,
    rowVersion: number,
    status: string,
    reason: string | null,
    requestId: string,
  ): Promise<Proposal | null>;
}

type ProposalRow = {
  id: string;
  management_no: string;
  project_position_id: string;
  engineer_id: string;
  destination_company_id: string;
  destination_contact_id: string | null;
  resume_version_id: string | null;
  requirement_version_id: string | null;
  proposed_unit_price: number | null;
  currency_code: string;
  status: string;
  proposed_start_date: string | null;
  validity_date: string | null;
  updated_at: string;
  row_version: number;
};

const select =
  'id,management_no,project_position_id,engineer_id,destination_company_id,destination_contact_id,resume_version_id,requirement_version_id,proposed_unit_price,currency_code,status,proposed_start_date,validity_date,updated_at,row_version';

export class SupabaseProposalRepository implements ProposalRepository {
  async canRead(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'proposal.read' }),
    });
    return (await response.json()) === true;
  }

  async canManage(token: string): Promise<boolean> {
    return this.hasPermission(token, 'proposal.manage');
  }

  async canSend(token: string): Promise<boolean> {
    return this.hasPermission(token, 'proposal.send');
  }

  async list(
    token: string,
    query: ProposalListQuery,
  ): Promise<ProposalListResult> {
    const params = new URLSearchParams({
      select,
      deleted_at: 'is.null',
      order: 'updated_at.desc,id.desc',
      limit: String(query.limit + 1),
    });
    const filters: string[] = [];
    if (query.query !== undefined)
      params.set('management_no', `ilike.*${escapeFilterValue(query.query)}*`);
    if (query.status !== undefined) params.set('status', `eq.${query.status}`);
    if (query.cursor !== undefined)
      filters.push(
        `or(updated_at.lt.${query.cursor.updatedAt},and(updated_at.eq.${query.cursor.updatedAt},id.lt.${query.cursor.id}))`,
      );
    if (filters.length > 0) params.set('and', `(${filters.join(',')})`);
    const response = await this.request(
      token,
      `/proposals?${params.toString()}`,
    );
    const rows = (await response.json()) as ProposalRow[];
    const visible = rows.slice(0, query.limit);
    const last = visible.at(-1);
    return {
      items: visible.map(toProposal),
      nextCursor:
        rows.length > query.limit && last
          ? { updatedAt: last.updated_at, id: last.id }
          : null,
    };
  }

  async findById(token: string, id: string): Promise<Proposal | null> {
    const params = new URLSearchParams({
      select,
      id: `eq.${id}`,
      deleted_at: 'is.null',
      limit: '1',
    });
    const response = await this.request(
      token,
      `/proposals?${params.toString()}`,
    );
    const rows = (await response.json()) as ProposalRow[];
    return rows[0] ? toProposal(rows[0]) : null;
  }

  async create(
    token: string,
    input: ProposalInput,
    requestId: string,
  ): Promise<Proposal | null> {
    return this.save(token, null, 0, input, requestId);
  }

  async update(
    token: string,
    id: string,
    rowVersion: number,
    input: ProposalInput,
    requestId: string,
  ): Promise<Proposal | null> {
    return this.save(token, id, rowVersion, input, requestId);
  }

  async transitionStatus(
    token: string,
    id: string,
    rowVersion: number,
    status: string,
    reason: string | null,
    requestId: string,
  ): Promise<Proposal | null> {
    const response = await this.request(
      token,
      '/rpc/transition_proposal_status',
      {
        method: 'POST',
        body: JSON.stringify({
          p_proposal_id: id,
          p_row_version: rowVersion,
          p_to_status: status,
          p_change_reason: reason,
          p_request_id: requestId,
        }),
      },
    );
    const row = (await response.json()) as ProposalRow | null;
    return row ? toProposal(row) : null;
  }

  private async save(
    token: string,
    id: string | null,
    rowVersion: number,
    input: ProposalInput,
    requestId: string,
  ): Promise<Proposal | null> {
    const response = await this.request(token, '/rpc/save_proposal', {
      method: 'POST',
      body: JSON.stringify({
        p_proposal_id: id,
        p_row_version: rowVersion,
        p_proposal: {
          management_no: input.managementNo,
          project_position_id: input.projectPositionId,
          engineer_id: input.engineerId,
          destination_company_id: input.destinationCompanyId,
          destination_contact_id: input.destinationContactId,
          resume_version_id: input.resumeVersionId,
          requirement_version_id: input.requirementVersionId,
          proposed_unit_price: input.proposedUnitPrice,
          currency_code: input.currencyCode,
          proposed_start_date: input.proposedStartDate,
          validity_date: input.validityDate,
        },
        p_request_id: requestId,
      }),
    });
    const row = (await response.json()) as ProposalRow | null;
    return row ? toProposal(row) : null;
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
  ): Promise<Response> {
    const url = `${requiredEnv('SUPABASE_URL')}/rest/v1${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        apikey: requiredEnv('SUPABASE_ANON_KEY'),
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok)
      throw new ApiError(
        502,
        'upstream_error',
        'Proposal data service request failed',
      );
    return response;
  }
}

function toProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    managementNo: row.management_no,
    projectPositionId: row.project_position_id,
    engineerId: row.engineer_id,
    destinationCompanyId: row.destination_company_id,
    destinationContactId: row.destination_contact_id,
    resumeVersionId: row.resume_version_id,
    requirementVersionId: row.requirement_version_id,
    proposedUnitPrice: row.proposed_unit_price,
    currencyCode: row.currency_code,
    status: row.status,
    proposedStartDate: row.proposed_start_date,
    validityDate: row.validity_date,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}

function escapeFilterValue(value: string): string {
  return value.replace(/[\\*,().]/g, (character) => `\\${character}`);
}
