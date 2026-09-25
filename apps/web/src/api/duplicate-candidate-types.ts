export type DuplicateEntityType = 'company' | 'engineer' | 'project';
export type DuplicateEntityFilter = DuplicateEntityType | 'all';
export type DuplicateDecision =
  | 'pending'
  | 'duplicate'
  | 'not_duplicate'
  | 'hold'
  | 'merged';
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

export interface DuplicateCandidateList {
  items: DuplicateCandidate[];
  page: {
    limit: number;
    nextCursor: string | null;
  };
}

export interface ListDuplicateCandidatesQuery {
  entityType?: DuplicateEntityFilter;
  decision?: DuplicateDecisionFilter;
  limit?: number;
  cursor?: string;
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

export interface DuplicateCandidateApi {
  listDuplicateCandidates(
    query?: ListDuplicateCandidatesQuery,
  ): Promise<DuplicateCandidateList>;
  reviewDuplicateCandidate(
    entityType: DuplicateEntityType,
    candidateId: string,
    input: DuplicateCandidateReviewInput,
  ): Promise<DuplicateCandidateReviewResult>;
}
