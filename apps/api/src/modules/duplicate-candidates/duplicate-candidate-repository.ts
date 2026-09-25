import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';
import { dataApiSchemaHeaders } from '../../shared/supabase-schema.js';

export type DuplicateEntityType = 'company' | 'engineer' | 'project';
export type DuplicateEntityFilter = DuplicateEntityType | 'all';
export type DuplicateDecision =
  'pending' | 'duplicate' | 'not_duplicate' | 'hold' | 'merged';
export type DuplicateDecisionFilter = DuplicateDecision | 'all';
export type DuplicateReviewDecision = 'duplicate' | 'not_duplicate' | 'hold';

export interface DuplicateRecordSummary {
  id: string;
  managementNo: string;
  name: string;
  status: string;
  secondary: string | null;
}

export interface DuplicateCandidate {
  entityType: DuplicateEntityType;
  id: string;
  score: number;
  matchReasons: unknown[];
  decision: DuplicateDecision;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  leftRecord: DuplicateRecordSummary;
  rightRecord: DuplicateRecordSummary;
}

export interface DuplicateCandidateListQuery {
  entityType: DuplicateEntityFilter;
  decision: DuplicateDecisionFilter;
  limit: number;
  cursor?: { score: number; id: string };
}

export interface DuplicateCandidateListResult {
  items: DuplicateCandidate[];
  nextCursor: { score: number; id: string } | null;
}

export interface DuplicateCandidateReviewInput {
  decision: DuplicateReviewDecision;
  note: string | null;
}

export interface DuplicateCandidateReviewResult {
  entityType: DuplicateEntityType;
  id: string;
  decision: DuplicateReviewDecision;
  reviewNote: string | null;
  reviewedAt: string;
  reviewedBy: string;
}

export interface DuplicateCandidateRepository {
  canRead(
    accessToken: string,
    entityType: DuplicateEntityFilter,
  ): Promise<boolean>;
  canManage(
    accessToken: string,
    entityType: DuplicateEntityType,
  ): Promise<boolean>;
  list(
    accessToken: string,
    query: DuplicateCandidateListQuery,
  ): Promise<DuplicateCandidateListResult>;
  review(
    accessToken: string,
    entityType: DuplicateEntityType,
    candidateId: string,
    input: DuplicateCandidateReviewInput,
  ): Promise<DuplicateCandidateReviewResult>;
}

type DuplicateCandidateRow = {
  entity_type: DuplicateEntityType;
  id: string;
  score: number;
  match_reasons: unknown[];
  decision: DuplicateDecision;
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  left_record: {
    id: string;
    management_no: string;
    name: string;
    status: string;
    secondary: string | null;
  };
  right_record: {
    id: string;
    management_no: string;
    name: string;
    status: string;
    secondary: string | null;
  };
};

type DuplicateCandidateListRow = {
  items: DuplicateCandidateRow[];
  next_cursor: { score: number; id: string } | null;
};

type DuplicateCandidateReviewRow = {
  entity_type: DuplicateEntityType;
  id: string;
  decision: DuplicateReviewDecision;
  review_note: string | null;
  reviewed_at: string;
  reviewed_by: string;
};

export class SupabaseDuplicateCandidateRepository implements DuplicateCandidateRepository {
  async canRead(token: string, entityType: DuplicateEntityFilter) {
    if (entityType === 'all') {
      const checks = await Promise.all([
        this.hasPermission(token, 'company.read'),
        this.hasPermission(token, 'engineer.read'),
        this.hasPermission(token, 'project.read'),
      ]);
      return checks.some(Boolean);
    }
    return this.hasPermission(token, `${entityType}.read`);
  }

  canManage(token: string, entityType: DuplicateEntityType) {
    return this.hasPermission(token, `${entityType}.manage`);
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
    query: DuplicateCandidateListQuery,
  ): Promise<DuplicateCandidateListResult> {
    const response = await this.request(
      token,
      '/rpc/list_duplicate_candidates',
      {
        method: 'POST',
        body: JSON.stringify({
          p_entity_type: query.entityType,
          p_decision: query.decision,
          p_limit: query.limit,
          p_cursor_score: query.cursor?.score ?? null,
          p_cursor_id: query.cursor?.id ?? null,
        }),
      },
      'Duplicate candidate list request was not permitted',
    );
    const row = (await response.json()) as DuplicateCandidateListRow;
    return {
      items: row.items.map(toDuplicateCandidate),
      nextCursor: row.next_cursor
        ? { score: row.next_cursor.score, id: row.next_cursor.id }
        : null,
    };
  }

  async review(
    token: string,
    entityType: DuplicateEntityType,
    candidateId: string,
    input: DuplicateCandidateReviewInput,
  ): Promise<DuplicateCandidateReviewResult> {
    const response = await this.request(
      token,
      '/rpc/review_duplicate_candidate',
      {
        method: 'POST',
        body: JSON.stringify({
          p_entity_type: entityType,
          p_candidate_id: candidateId,
          p_decision: input.decision,
          p_note: input.note,
        }),
      },
      'Duplicate candidate review was not permitted',
    );
    const row = (await response.json()) as DuplicateCandidateReviewRow;
    return {
      entityType: row.entity_type,
      id: row.id,
      decision: row.decision,
      reviewNote: row.review_note,
      reviewedAt: row.reviewed_at,
      reviewedBy: row.reviewed_by,
    };
  }

  private async request(
    token: string,
    path: string,
    init: RequestInit,
    forbiddenMessage = 'Duplicate candidate data request was not permitted',
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
    if (response.status === 401 || response.status === 403)
      throw new ApiError(403, 'forbidden', forbiddenMessage);
    if (!response.ok)
      throw new ApiError(
        502,
        'upstream_error',
        'Duplicate candidate data service request failed',
      );
    return response;
  }
}

function toDuplicateCandidate(row: DuplicateCandidateRow): DuplicateCandidate {
  return {
    entityType: row.entity_type,
    id: row.id,
    score: row.score,
    matchReasons: row.match_reasons,
    decision: row.decision,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    createdAt: row.created_at,
    leftRecord: {
      id: row.left_record.id,
      managementNo: row.left_record.management_no,
      name: row.left_record.name,
      status: row.left_record.status,
      secondary: row.left_record.secondary,
    },
    rightRecord: {
      id: row.right_record.id,
      managementNo: row.right_record.management_no,
      name: row.right_record.name,
      status: row.right_record.status,
      secondary: row.right_record.secondary,
    },
  };
}
