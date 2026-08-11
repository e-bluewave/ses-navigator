import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export interface Interview {
  id: string;
  proposalId: string;
  proposalManagementNo: string;
  projectPositionId: string;
  engineerId: string;
  interviewRound: number;
  interviewType: string;
  status: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  locationText: string | null;
  meetingUrl: string | null;
  notes: string | null;
  updatedAt: string;
  rowVersion: number;
}

export interface InterviewListQuery {
  limit: number;
  cursor?: { updatedAt: string; id: string };
  query?: string;
  status?: string;
}

export interface InterviewListResult {
  items: Interview[];
  nextCursor: { updatedAt: string; id: string } | null;
}

export interface InterviewRepository {
  canRead(accessToken: string): Promise<boolean>;
  list(
    accessToken: string,
    query: InterviewListQuery,
  ): Promise<InterviewListResult>;
  findById(accessToken: string, id: string): Promise<Interview | null>;
}

type InterviewRow = {
  id: string;
  proposal_id: string;
  interview_round: number;
  interview_type: string;
  status: string;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  location_text: string | null;
  meeting_url: string | null;
  notes: string | null;
  updated_at: string;
  row_version: number;
  proposal: {
    management_no: string;
    project_position_id: string;
    engineer_id: string;
  };
};

const select =
  'id,proposal_id,interview_round,interview_type,status,scheduled_start_at,scheduled_end_at,location_text,meeting_url,notes,updated_at,row_version,proposal:proposals!inner(management_no,project_position_id,engineer_id)';

export class SupabaseInterviewRepository implements InterviewRepository {
  async canRead(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'interview.read' }),
    });
    return (await response.json()) === true;
  }

  async list(
    token: string,
    query: InterviewListQuery,
  ): Promise<InterviewListResult> {
    const params = new URLSearchParams({
      select,
      order: 'updated_at.desc,id.desc',
      limit: String(query.limit + 1),
    });
    const filters: string[] = [];
    if (query.query !== undefined)
      params.set(
        'proposal.management_no',
        `ilike.*${escapeFilterValue(query.query)}*`,
      );
    if (query.status !== undefined) params.set('status', `eq.${query.status}`);
    if (query.cursor !== undefined)
      filters.push(
        `or(updated_at.lt.${query.cursor.updatedAt},and(updated_at.eq.${query.cursor.updatedAt},id.lt.${query.cursor.id}))`,
      );
    if (filters.length > 0) params.set('and', `(${filters.join(',')})`);
    const response = await this.request(
      token,
      `/interviews?${params.toString()}`,
    );
    const rows = (await response.json()) as InterviewRow[];
    const visible = rows.slice(0, query.limit);
    const last = visible.at(-1);
    return {
      items: visible.map(toInterview),
      nextCursor:
        rows.length > query.limit && last
          ? { updatedAt: last.updated_at, id: last.id }
          : null,
    };
  }

  async findById(token: string, id: string): Promise<Interview | null> {
    const params = new URLSearchParams({ select, id: `eq.${id}`, limit: '1' });
    const response = await this.request(
      token,
      `/interviews?${params.toString()}`,
    );
    const rows = (await response.json()) as InterviewRow[];
    return rows[0] ? toInterview(rows[0]) : null;
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
        'Interview data service request failed',
      );
    return response;
  }
}

function toInterview(row: InterviewRow): Interview {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    proposalManagementNo: row.proposal.management_no,
    projectPositionId: row.proposal.project_position_id,
    engineerId: row.proposal.engineer_id,
    interviewRound: row.interview_round,
    interviewType: row.interview_type,
    status: row.status,
    scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at,
    locationText: row.location_text,
    meetingUrl: row.meeting_url,
    notes: row.notes,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}

function escapeFilterValue(value: string): string {
  return value.replace(/[\\*,().]/g, (character) => `\\${character}`);
}
