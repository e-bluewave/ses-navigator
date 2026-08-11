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
  scheduleCandidates: InterviewScheduleCandidate[];
  participants: InterviewParticipant[];
  feedback: InterviewFeedback[];
  outcome: InterviewOutcome | null;
  statusHistory: InterviewStatusHistory[];
  updatedAt: string;
  rowVersion: number;
}

export interface InterviewScheduleCandidate {
  id: string;
  startAt: string;
  endAt: string;
  candidateOrder: number;
}

export interface InterviewParticipant {
  id: string;
  participantType: 'engineer' | 'user' | 'company_contact' | 'other';
  engineerId: string | null;
  userId: string | null;
  companyContactId: string | null;
  displayName: string | null;
  email: string | null;
  roleLabel: string | null;
  attendanceStatus:
    'expected' | 'accepted' | 'declined' | 'attended' | 'absent';
}

export interface InterviewFeedback {
  id: string;
  evaluatorUserId: string | null;
  evaluatorContactId: string | null;
  evaluationType: 'internal' | 'customer' | 'engineer';
  overallRating: number | null;
  technicalRating: number | null;
  communicationRating: number | null;
  recommendation: 'strong_yes' | 'yes' | 'hold' | 'no' | 'strong_no' | null;
  comments: string | null;
  submittedAt: string | null;
  updatedAt: string;
  rowVersion: number;
}

export interface InterviewOutcome {
  id: string;
  outcome: 'pass' | 'fail' | 'hold' | 'withdrawn' | 'pending';
  decidedAt: string | null;
  decisionSource: 'customer' | 'internal' | 'engineer' | 'system' | null;
  reason: string | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
  updatedAt: string;
  rowVersion: number;
}

export interface InterviewStatusHistory {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: string;
  reason: string | null;
}

export interface InterviewInput {
  proposalId: string;
  interviewRound: number;
  interviewType: string;
  status: 'tentative' | 'scheduled';
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  locationText: string | null;
  meetingUrl: string | null;
  notes: string | null;
  scheduleCandidates: Array<{ startAt: string; endAt: string }>;
}

export interface InterviewResultInput {
  status: 'completed' | 'cancelled' | 'no_show';
  reason: string | null;
  participants: Array<{
    participantType: 'engineer' | 'user' | 'company_contact' | 'other';
    engineerId: string | null;
    userId: string | null;
    companyContactId: string | null;
    displayName: string | null;
    email: string | null;
    roleLabel: string | null;
    attendanceStatus:
      'expected' | 'accepted' | 'declined' | 'attended' | 'absent';
  }>;
  feedback: {
    evaluationType: 'internal';
    overallRating: number | null;
    technicalRating: number | null;
    communicationRating: number | null;
    recommendation: 'strong_yes' | 'yes' | 'hold' | 'no' | 'strong_no' | null;
    comments: string | null;
  } | null;
  outcome: {
    outcome: 'pass' | 'fail' | 'hold' | 'withdrawn' | 'pending';
    decidedAt: string | null;
    decisionSource: 'customer' | 'internal' | 'engineer' | 'system';
    reason: string | null;
    nextAction: string | null;
    nextActionDueAt: string | null;
  } | null;
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
  canManage(accessToken: string): Promise<boolean>;
  list(
    accessToken: string,
    query: InterviewListQuery,
  ): Promise<InterviewListResult>;
  findById(accessToken: string, id: string): Promise<Interview | null>;
  create(
    accessToken: string,
    input: InterviewInput,
    requestId: string,
  ): Promise<Interview | null>;
  update(
    accessToken: string,
    id: string,
    rowVersion: number,
    input: InterviewInput,
    requestId: string,
  ): Promise<Interview | null>;
  saveResult(
    accessToken: string,
    id: string,
    rowVersion: number,
    input: InterviewResultInput,
    requestId: string,
  ): Promise<Interview | null>;
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
  schedule_candidates: Array<{
    id: string;
    candidate_start_at: string;
    candidate_end_at: string;
    candidate_order: number;
  }>;
  participants: Array<{
    id: string;
    participant_type: InterviewParticipant['participantType'];
    engineer_id: string | null;
    user_id: string | null;
    company_contact_id: string | null;
    display_name: string | null;
    email: string | null;
    role_label: string | null;
    attendance_status: InterviewParticipant['attendanceStatus'];
  }>;
  feedback: Array<{
    id: string;
    evaluator_user_id: string | null;
    evaluator_contact_id: string | null;
    evaluation_type: InterviewFeedback['evaluationType'];
    overall_rating: number | null;
    technical_rating: number | null;
    communication_rating: number | null;
    recommendation: InterviewFeedback['recommendation'];
    comments: string | null;
    submitted_at: string | null;
    updated_at: string;
    row_version: number;
  }>;
  outcome:
    | {
        id: string;
        outcome: InterviewOutcome['outcome'];
        decided_at: string | null;
        decision_source: InterviewOutcome['decisionSource'];
        reason: string | null;
        next_action: string | null;
        next_action_due_at: string | null;
        updated_at: string;
        row_version: number;
      }
    | Array<{
        id: string;
        outcome: InterviewOutcome['outcome'];
        decided_at: string | null;
        decision_source: InterviewOutcome['decisionSource'];
        reason: string | null;
        next_action: string | null;
        next_action_due_at: string | null;
        updated_at: string;
        row_version: number;
      }>
    | null;
  status_history: Array<{
    id: string;
    from_status: string | null;
    to_status: string;
    changed_at: string;
    reason: string | null;
  }>;
  proposal: {
    management_no: string;
    project_position_id: string;
    engineer_id: string;
  };
};

const select =
  'id,proposal_id,interview_round,interview_type,status,scheduled_start_at,scheduled_end_at,location_text,meeting_url,notes,updated_at,row_version,schedule_candidates:interview_schedule_candidates(id,candidate_start_at,candidate_end_at,candidate_order),participants:interview_participants(id,participant_type,engineer_id,user_id,company_contact_id,display_name,email,role_label,attendance_status),feedback:interview_feedback(id,evaluator_user_id,evaluator_contact_id,evaluation_type,overall_rating,technical_rating,communication_rating,recommendation,comments,submitted_at,updated_at,row_version),outcome:interview_outcomes(id,outcome,decided_at,decision_source,reason,next_action,next_action_due_at,updated_at,row_version),status_history:interview_status_histories(id,from_status,to_status,changed_at,reason),proposal:proposals!inner(management_no,project_position_id,engineer_id)';

export class SupabaseInterviewRepository implements InterviewRepository {
  async canRead(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'interview.read' }),
    });
    return (await response.json()) === true;
  }

  async canManage(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'interview.manage' }),
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

  async create(
    token: string,
    input: InterviewInput,
    requestId: string,
  ): Promise<Interview | null> {
    return this.save(token, null, 0, input, requestId);
  }

  async update(
    token: string,
    id: string,
    rowVersion: number,
    input: InterviewInput,
    requestId: string,
  ): Promise<Interview | null> {
    return this.save(token, id, rowVersion, input, requestId);
  }

  async saveResult(
    token: string,
    id: string,
    rowVersion: number,
    input: InterviewResultInput,
    requestId: string,
  ): Promise<Interview | null> {
    const response = await this.request(token, '/rpc/save_interview_result', {
      method: 'POST',
      body: JSON.stringify({
        p_interview_id: id,
        p_row_version: rowVersion,
        p_status: input.status,
        p_reason: input.reason,
        p_participants: input.participants.map((participant) => ({
          participant_type: participant.participantType,
          engineer_id: participant.engineerId,
          user_id: participant.userId,
          company_contact_id: participant.companyContactId,
          display_name: participant.displayName,
          email: participant.email,
          role_label: participant.roleLabel,
          attendance_status: participant.attendanceStatus,
        })),
        p_feedback: input.feedback
          ? {
              evaluation_type: input.feedback.evaluationType,
              overall_rating: input.feedback.overallRating,
              technical_rating: input.feedback.technicalRating,
              communication_rating: input.feedback.communicationRating,
              recommendation: input.feedback.recommendation,
              comments: input.feedback.comments,
            }
          : null,
        p_outcome: input.outcome
          ? {
              outcome: input.outcome.outcome,
              decided_at: input.outcome.decidedAt,
              decision_source: input.outcome.decisionSource,
              reason: input.outcome.reason,
              next_action: input.outcome.nextAction,
              next_action_due_at: input.outcome.nextActionDueAt,
            }
          : null,
        p_request_id: requestId,
      }),
    });
    const saved = (await response.json()) as { id: string } | null;
    return saved ? this.findById(token, saved.id) : null;
  }

  private async save(
    token: string,
    id: string | null,
    rowVersion: number,
    input: InterviewInput,
    requestId: string,
  ): Promise<Interview | null> {
    const response = await this.request(token, '/rpc/save_interview', {
      method: 'POST',
      body: JSON.stringify({
        p_interview_id: id,
        p_row_version: rowVersion,
        p_interview: {
          proposal_id: input.proposalId,
          interview_round: input.interviewRound,
          interview_type: input.interviewType,
          status: input.status,
          scheduled_start_at: input.scheduledStartAt,
          scheduled_end_at: input.scheduledEndAt,
          location_text: input.locationText,
          meeting_url: input.meetingUrl,
          notes: input.notes,
          schedule_candidates: input.scheduleCandidates.map((candidate) => ({
            start_at: candidate.startAt,
            end_at: candidate.endAt,
          })),
        },
        p_request_id: requestId,
      }),
    });
    const row = (await response.json()) as
      | (Omit<InterviewRow, 'proposal'> & {
          proposal_management_no: string;
          project_position_id: string;
          engineer_id: string;
        })
      | null;
    return row
      ? toInterview({
          ...row,
          proposal: {
            management_no: row.proposal_management_no,
            project_position_id: row.project_position_id,
            engineer_id: row.engineer_id,
          },
        })
      : null;
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
  const outcomeRow = Array.isArray(row.outcome) ? row.outcome[0] : row.outcome;
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
    scheduleCandidates: [...(row.schedule_candidates ?? [])]
      .sort((left, right) => left.candidate_order - right.candidate_order)
      .map((candidate) => ({
        id: candidate.id,
        startAt: candidate.candidate_start_at,
        endAt: candidate.candidate_end_at,
        candidateOrder: candidate.candidate_order,
      })),
    participants: (row.participants ?? []).map((participant) => ({
      id: participant.id,
      participantType: participant.participant_type,
      engineerId: participant.engineer_id,
      userId: participant.user_id,
      companyContactId: participant.company_contact_id,
      displayName: participant.display_name,
      email: participant.email,
      roleLabel: participant.role_label,
      attendanceStatus: participant.attendance_status,
    })),
    feedback: (row.feedback ?? []).map((feedback) => ({
      id: feedback.id,
      evaluatorUserId: feedback.evaluator_user_id,
      evaluatorContactId: feedback.evaluator_contact_id,
      evaluationType: feedback.evaluation_type,
      overallRating: feedback.overall_rating,
      technicalRating: feedback.technical_rating,
      communicationRating: feedback.communication_rating,
      recommendation: feedback.recommendation,
      comments: feedback.comments,
      submittedAt: feedback.submitted_at,
      updatedAt: feedback.updated_at,
      rowVersion: feedback.row_version,
    })),
    outcome: outcomeRow
      ? {
          id: outcomeRow.id,
          outcome: outcomeRow.outcome,
          decidedAt: outcomeRow.decided_at,
          decisionSource: outcomeRow.decision_source,
          reason: outcomeRow.reason,
          nextAction: outcomeRow.next_action,
          nextActionDueAt: outcomeRow.next_action_due_at,
          updatedAt: outcomeRow.updated_at,
          rowVersion: outcomeRow.row_version,
        }
      : null,
    statusHistory: [...(row.status_history ?? [])]
      .sort((left, right) => left.changed_at.localeCompare(right.changed_at))
      .map((history) => ({
        id: history.id,
        fromStatus: history.from_status,
        toStatus: history.to_status,
        changedAt: history.changed_at,
        reason: history.reason,
      })),
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}

function escapeFilterValue(value: string): string {
  return value.replace(/[\\*,().]/g, (character) => `\\${character}`);
}
