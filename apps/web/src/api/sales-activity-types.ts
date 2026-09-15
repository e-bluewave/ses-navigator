export type SalesActivityType =
  | 'call'
  | 'email'
  | 'meeting'
  | 'visit'
  | 'proposal'
  | 'follow_up'
  | 'other';

export type SalesActivityDirection = 'inbound' | 'outbound' | 'internal';
export type SalesActivityPriority = 'low' | 'normal' | 'high' | 'urgent';
export type SalesActivityTaskStatus =
  | 'open'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'cancelled';

export interface SalesActivityContact {
  id: string;
  familyName: string;
  givenName: string | null;
  departmentName: string | null;
  positionTitle: string | null;
}

export interface SalesActivityProject {
  id: string;
  managementNo: string;
  projectName: string;
}

export interface SalesActivityEngineer {
  id: string;
  managementNo: string;
  displayName: string;
}

export interface SalesActivityFollowUpTask {
  id: string;
  title: string;
  description?: string | null;
  status: SalesActivityTaskStatus;
  priority: SalesActivityPriority;
  dueAt: string | null;
  completedAt: string | null;
  rowVersion: number;
}

export interface SalesActivity {
  id: string;
  companyId: string;
  activityType: SalesActivityType;
  direction: SalesActivityDirection | null;
  occurredAt: string;
  subject: string;
  summary: string;
  result: string | null;
  contact: SalesActivityContact | null;
  project: SalesActivityProject | null;
  engineer: SalesActivityEngineer | null;
  followUpTask: SalesActivityFollowUpTask | null;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
}

export interface SalesActivityList {
  items: SalesActivity[];
  page: {
    limit: number;
    nextCursor: string | null;
  };
}

export interface ListSalesActivitiesQuery {
  limit?: number;
  cursor?: string;
}

export interface SalesActivityFollowUpInput {
  title: string;
  description: string | null;
  dueAt: string;
  priority: SalesActivityPriority;
}

export interface SalesActivityInput {
  activityType: SalesActivityType;
  direction: SalesActivityDirection | null;
  occurredAt: string;
  subject: string;
  summary: string;
  result: string | null;
  companyContactId: string | null;
  projectId: string | null;
  engineerId: string | null;
  followUp: SalesActivityFollowUpInput | null;
}

export interface SalesActivityCreateResult {
  activity: Omit<
    SalesActivity,
    'contact' | 'project' | 'engineer' | 'followUpTask'
  >;
  followUpTask: SalesActivityFollowUpTask | null;
}
