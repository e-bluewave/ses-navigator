import type {
  ApiErrorBody,
  AuthContext,
  ListProjectsQuery,
  Project,
  ProjectInput,
  ProjectList,
  ProjectAuditList,
  Company,
  CompanyInput,
  CompanyList,
  CompanyAuditList,
  ListCompaniesQuery,
  CompanyContact,
  CompanyContactInput,
  CompanyContactList,
  CompanyContactAuditList,
  ListCompanyContactsQuery,
  Engineer,
  EngineerInput,
  EngineerList,
  EngineerAuditList,
  ListEngineersQuery,
  EngineerPrivateDetail,
  EngineerPrivateInput,
  EngineerAffiliation,
  EngineerAffiliationInput,
  EngineerAffiliationList,
  EngineerPreference,
  EngineerPreferenceInput,
  EngineerPreferenceList,
  EngineerSkill,
  EngineerSkillInput,
  EngineerSkillList,
  EngineerQualification,
  EngineerQualificationInput,
  EngineerQualificationList,
  EngineerCareerHistory,
  EngineerCareerHistoryInput,
  EngineerCareerHistoryList,
  EngineerResume,
  EngineerResumeVersionInput,
  EngineerResumeList,
  Proposal,
  ProposalInput,
  ProposalList,
  ProposalStatusTransitionInput,
  ProposalWinResult,
  ListProposalsQuery,
  Interview,
  InterviewInput,
  InterviewResultInput,
  InterviewList,
  ListInterviewsQuery,
  Contract,
  ContractInput,
  ContractList,
  ContractStatusTransitionInput,
  ListContractsQuery,
  Engagement,
  EngagementList,
  ListEngagementsQuery,
  EngagementInput,
  EngagementStatusTransitionInput,
  WorkLog,
  WorkLogList,
  ListWorkLogsQuery,
  WorkLogInput,
  WorkLogStatusTransitionInput,
  Invoice,
  InvoiceList,
  ListInvoicesQuery,
  InvoiceOptions,
  InvoiceInput,
  InvoiceStatusTransitionInput,
  InvoicePaymentInput,
  InvoicePaymentReversalInput,
} from './generated.js';

export interface ProjectsApi {
  getAuthContext(): Promise<AuthContext>;
  listInvoices(query?: ListInvoicesQuery): Promise<InvoiceList>;
  getInvoice(id: string): Promise<Invoice>;
  getInvoiceOptions(): Promise<InvoiceOptions>;
  createInvoice(input: InvoiceInput): Promise<Invoice>;
  updateInvoice(
    id: string,
    rowVersion: number,
    input: InvoiceInput,
  ): Promise<Invoice>;
  transitionInvoiceStatus(
    id: string,
    rowVersion: number,
    input: InvoiceStatusTransitionInput,
  ): Promise<Invoice>;
  registerInvoicePayment(
    id: string,
    rowVersion: number,
    input: InvoicePaymentInput,
  ): Promise<Invoice>;
  reverseInvoicePayment(
    id: string,
    paymentId: string,
    rowVersion: number,
    input: InvoicePaymentReversalInput,
  ): Promise<Invoice>;
  listWorkLogs(query?: ListWorkLogsQuery): Promise<WorkLogList>;
  getWorkLog(id: string): Promise<WorkLog>;
  createWorkLog(input: WorkLogInput): Promise<WorkLog>;
  updateWorkLog(
    id: string,
    rowVersion: number,
    input: WorkLogInput,
  ): Promise<WorkLog>;
  transitionWorkLogStatus(
    id: string,
    rowVersion: number,
    input: WorkLogStatusTransitionInput,
  ): Promise<WorkLog>;
  listEngagements(query?: ListEngagementsQuery): Promise<EngagementList>;
  getEngagement(id: string): Promise<Engagement>;
  createEngagement(input: EngagementInput): Promise<Engagement>;
  updateEngagement(
    id: string,
    rowVersion: number,
    input: EngagementInput,
  ): Promise<Engagement>;
  transitionEngagementStatus(
    id: string,
    rowVersion: number,
    input: EngagementStatusTransitionInput,
  ): Promise<Engagement>;
  listContracts(query?: ListContractsQuery): Promise<ContractList>;
  getContract(id: string): Promise<Contract>;
  createContract(input: ContractInput): Promise<Contract>;
  updateContract(
    id: string,
    rowVersion: number,
    input: ContractInput,
  ): Promise<Contract>;
  transitionContractStatus(
    id: string,
    rowVersion: number,
    input: ContractStatusTransitionInput,
  ): Promise<Contract>;
  listInterviews(query?: ListInterviewsQuery): Promise<InterviewList>;
  getInterview(id: string): Promise<Interview>;
  createInterview(input: InterviewInput): Promise<Interview>;
  updateInterview(
    id: string,
    rowVersion: number,
    input: InterviewInput,
  ): Promise<Interview>;
  saveInterviewResult(
    id: string,
    rowVersion: number,
    input: InterviewResultInput,
  ): Promise<Interview>;
  listProposals(query?: ListProposalsQuery): Promise<ProposalList>;
  getProposal(id: string): Promise<Proposal>;
  createProposal(input: ProposalInput): Promise<Proposal>;
  updateProposal(
    id: string,
    rowVersion: number,
    input: ProposalInput,
  ): Promise<Proposal>;
  transitionProposalStatus(
    id: string,
    rowVersion: number,
    input: ProposalStatusTransitionInput,
  ): Promise<Proposal>;
  winProposal(id: string, rowVersion: number): Promise<ProposalWinResult>;
  listEngineerCareerHistories(id: string): Promise<EngineerCareerHistoryList>;
  saveEngineerCareerHistory(
    id: string,
    itemId: string,
    rowVersion: number,
    input: EngineerCareerHistoryInput,
  ): Promise<EngineerCareerHistory>;
  listEngineerResumes(id: string): Promise<EngineerResumeList>;
  addEngineerResumeVersion(
    id: string,
    resumeId: string,
    rowVersion: number,
    input: EngineerResumeVersionInput,
  ): Promise<EngineerResume>;
  listProjects(query?: ListProjectsQuery): Promise<ProjectList>;
  getProject(id: string): Promise<Project>;
  createProject(input: ProjectInput): Promise<Project>;
  updateProject(
    id: string,
    rowVersion: number,
    input: ProjectInput,
  ): Promise<Project>;
  deleteProject(id: string, rowVersion: number, reason: string): Promise<void>;
  listProjectAudit(id: string): Promise<ProjectAuditList>;
  listCompanies(query?: ListCompaniesQuery): Promise<CompanyList>;
  getCompany(id: string): Promise<Company>;
  createCompany(input: CompanyInput): Promise<Company>;
  updateCompany(
    id: string,
    rowVersion: number,
    input: CompanyInput,
  ): Promise<Company>;
  deleteCompany(id: string, rowVersion: number, reason: string): Promise<void>;
  listCompanyAudit(id: string): Promise<CompanyAuditList>;
  listCompanyContacts(
    query?: ListCompanyContactsQuery,
  ): Promise<CompanyContactList>;
  getCompanyContact(id: string): Promise<CompanyContact>;
  createCompanyContact(input: CompanyContactInput): Promise<CompanyContact>;
  updateCompanyContact(
    id: string,
    rowVersion: number,
    input: CompanyContactInput,
  ): Promise<CompanyContact>;
  deleteCompanyContact(
    id: string,
    rowVersion: number,
    reason: string,
  ): Promise<void>;
  listCompanyContactAudit(id: string): Promise<CompanyContactAuditList>;
  listEngineers(query?: ListEngineersQuery): Promise<EngineerList>;
  getEngineer(id: string): Promise<Engineer>;
  createEngineer(input: EngineerInput): Promise<Engineer>;
  updateEngineer(
    id: string,
    rowVersion: number,
    input: EngineerInput,
  ): Promise<Engineer>;
  deleteEngineer(id: string, rowVersion: number, reason: string): Promise<void>;
  listEngineerAudit(id: string): Promise<EngineerAuditList>;
  getEngineerPrivate(id: string): Promise<EngineerPrivateDetail>;
  updateEngineerPrivate(
    id: string,
    rowVersion: number,
    input: EngineerPrivateInput,
  ): Promise<EngineerPrivateDetail>;
  listEngineerAffiliations(id: string): Promise<EngineerAffiliationList>;
  saveEngineerAffiliation(
    id: string,
    affiliationId: string | null,
    rowVersion: number,
    input: EngineerAffiliationInput,
  ): Promise<EngineerAffiliation>;
  listEngineerPreferences(id: string): Promise<EngineerPreferenceList>;
  saveEngineerPreference(
    id: string,
    preferenceId: string | null,
    rowVersion: number,
    input: EngineerPreferenceInput,
  ): Promise<EngineerPreference>;
  listEngineerSkills(id: string): Promise<EngineerSkillList>;
  saveEngineerSkill(
    id: string,
    itemId: string | null,
    rowVersion: number,
    input: EngineerSkillInput,
  ): Promise<EngineerSkill>;
  listEngineerQualifications(id: string): Promise<EngineerQualificationList>;
  saveEngineerQualification(
    id: string,
    itemId: string | null,
    rowVersion: number,
    input: EngineerQualificationInput,
  ): Promise<EngineerQualification>;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

export function createProjectsApi(options: {
  getAccessToken: () => string | null;
  baseUrl?: string;
  fetch?: typeof fetch;
  createIdempotencyKey?: () => string;
}): ProjectsApi {
  const baseUrl = options.baseUrl ?? '/api/v1';
  const request = options.fetch ?? fetch;
  const createIdempotencyKey =
    options.createIdempotencyKey ?? (() => crypto.randomUUID());

  async function get<T>(path: string): Promise<T> {
    const token = options.getAccessToken();
    const response = await request(`${baseUrl}${path}`, {
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const body = (await response
        .json()
        .catch(() => null)) as ApiErrorBody | null;
      throw new ApiClientError(
        response.status,
        body?.error.code ?? 'unexpected_error',
        body?.error.message ?? 'APIへの接続に失敗しました。',
        body?.error.requestId,
      );
    }
    return response.json() as Promise<T>;
  }

  async function send<T>(
    path: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body: unknown,
    rowVersion?: number,
    additionalHeaders: Record<string, string> = {},
  ): Promise<T> {
    const token = options.getAccessToken();
    const response = await request(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
        ...(rowVersion === undefined ? {} : { 'if-match': `"${rowVersion}"` }),
        ...additionalHeaders,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = (await response
        .json()
        .catch(() => null)) as ApiErrorBody | null;
      throw new ApiClientError(
        response.status,
        error?.error.code ?? 'unexpected_error',
        error?.error.message ?? 'APIへの接続に失敗しました。',
        error?.error.requestId,
      );
    }
    return response.status === 204
      ? (undefined as T)
      : (response.json() as Promise<T>);
  }

  return {
    getAuthContext() {
      return get<AuthContext>('/auth/context');
    },
    listInvoices(query = {}) {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.status) params.set('status', query.status);
      if (query.invoiceType) params.set('invoiceType', query.invoiceType);
      if (query.dueFrom) params.set('dueFrom', query.dueFrom);
      if (query.dueTo) params.set('dueTo', query.dueTo);
      if (query.cursor) params.set('cursor', query.cursor);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return get<InvoiceList>(`/invoices${suffix}`);
    },
    getInvoice(id) {
      return get<Invoice>(`/invoices/${encodeURIComponent(id)}`);
    },
    getInvoiceOptions() {
      return get<InvoiceOptions>('/invoices/options');
    },
    createInvoice(input) {
      return send<Invoice>('/invoices', 'POST', input);
    },
    updateInvoice(id, rowVersion, input) {
      return send<Invoice>(
        `/invoices/${encodeURIComponent(id)}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    transitionInvoiceStatus(id, rowVersion, input) {
      return send<Invoice>(
        `/invoices/${encodeURIComponent(id)}/status`,
        'POST',
        input,
        rowVersion,
      );
    },
    registerInvoicePayment(id, rowVersion, input) {
      return send<Invoice>(
        `/invoices/${encodeURIComponent(id)}/payments`,
        'POST',
        input,
        rowVersion,
      );
    },
    reverseInvoicePayment(id, paymentId, rowVersion, input) {
      return send<Invoice>(
        `/invoices/${encodeURIComponent(id)}/payments/${encodeURIComponent(paymentId)}/reversal`,
        'POST',
        input,
        rowVersion,
      );
    },
    listWorkLogs(query = {}) {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.status) params.set('status', query.status);
      if (query.workMonth) params.set('workMonth', query.workMonth);
      if (query.cursor) params.set('cursor', query.cursor);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return get<WorkLogList>(`/work-logs${suffix}`);
    },
    getWorkLog(id) {
      return get<WorkLog>(`/work-logs/${encodeURIComponent(id)}`);
    },
    createWorkLog(input) {
      return send<WorkLog>('/work-logs', 'POST', input);
    },
    updateWorkLog(id, rowVersion, input) {
      return send<WorkLog>(
        `/work-logs/${encodeURIComponent(id)}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    transitionWorkLogStatus(id, rowVersion, input) {
      return send<WorkLog>(
        `/work-logs/${encodeURIComponent(id)}/status`,
        'POST',
        input,
        rowVersion,
      );
    },
    listEngagements(query = {}) {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.status) params.set('status', query.status);
      if (query.cursor) params.set('cursor', query.cursor);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return get<EngagementList>(`/engagements${suffix}`);
    },
    getEngagement(id) {
      return get<Engagement>(`/engagements/${encodeURIComponent(id)}`);
    },
    createEngagement(input) {
      return send<Engagement>('/engagements', 'POST', input);
    },
    updateEngagement(id, rowVersion, input) {
      return send<Engagement>(
        `/engagements/${encodeURIComponent(id)}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    transitionEngagementStatus(id, rowVersion, input) {
      return send<Engagement>(
        `/engagements/${encodeURIComponent(id)}/status`,
        'POST',
        input,
        rowVersion,
      );
    },
    listContracts(query = {}) {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.status) params.set('status', query.status);
      if (query.cursor) params.set('cursor', query.cursor);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return get<ContractList>(`/contracts${suffix}`);
    },
    getContract(id) {
      return get<Contract>(`/contracts/${encodeURIComponent(id)}`);
    },
    createContract(input) {
      return send<Contract>('/contracts', 'POST', input);
    },
    updateContract(id, rowVersion, input) {
      return send<Contract>(
        `/contracts/${encodeURIComponent(id)}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    transitionContractStatus(id, rowVersion, input) {
      return send<Contract>(
        `/contracts/${encodeURIComponent(id)}/status`,
        'POST',
        input,
        rowVersion,
      );
    },
    listInterviews(query = {}) {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.status) params.set('status', query.status);
      if (query.cursor) params.set('cursor', query.cursor);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return get<InterviewList>(`/interviews${suffix}`);
    },
    getInterview(id) {
      return get<Interview>(`/interviews/${encodeURIComponent(id)}`);
    },
    createInterview(input) {
      return send<Interview>('/interviews', 'POST', input);
    },
    updateInterview(id, rowVersion, input) {
      return send<Interview>(
        `/interviews/${encodeURIComponent(id)}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    saveInterviewResult(id, rowVersion, input) {
      return send<Interview>(
        `/interviews/${encodeURIComponent(id)}/result`,
        'POST',
        input,
        rowVersion,
      );
    },
    listProposals(query = {}) {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.status) params.set('status', query.status);
      if (query.cursor) params.set('cursor', query.cursor);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return get<ProposalList>(`/proposals${suffix}`);
    },
    getProposal(id) {
      return get<Proposal>(`/proposals/${encodeURIComponent(id)}`);
    },
    createProposal(input) {
      return send<Proposal>('/proposals', 'POST', input);
    },
    updateProposal(id, rowVersion, input) {
      return send<Proposal>(
        `/proposals/${encodeURIComponent(id)}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    transitionProposalStatus(id, rowVersion, input) {
      return send<Proposal>(
        `/proposals/${encodeURIComponent(id)}/status`,
        'POST',
        input,
        rowVersion,
      );
    },
    winProposal(id, rowVersion) {
      return send<ProposalWinResult>(
        `/proposals/${encodeURIComponent(id)}/win`,
        'POST',
        {},
        rowVersion,
        { 'idempotency-key': createIdempotencyKey() },
      );
    },
    listEngineerCareerHistories(id) {
      return get<EngineerCareerHistoryList>(
        `/engineers/${encodeURIComponent(id)}/career-histories`,
      );
    },
    saveEngineerCareerHistory(id, itemId, rowVersion, input) {
      return send<EngineerCareerHistory>(
        `/engineers/${encodeURIComponent(id)}/career-histories/${encodeURIComponent(itemId)}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    listEngineerResumes(id) {
      return get<EngineerResumeList>(
        `/engineers/${encodeURIComponent(id)}/resumes`,
      );
    },
    addEngineerResumeVersion(id, resumeId, rowVersion, input) {
      return send<EngineerResume>(
        `/engineers/${encodeURIComponent(id)}/resumes/${encodeURIComponent(resumeId)}/versions`,
        'POST',
        input,
        rowVersion,
      );
    },
    listProjects(query = {}) {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.status) params.set('status', query.status);
      if (query.recruitmentStatus)
        params.set('recruitmentStatus', query.recruitmentStatus);
      if (query.cursor) params.set('cursor', query.cursor);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return get<ProjectList>(`/projects${suffix}`);
    },
    getProject(id) {
      return get<Project>(`/projects/${encodeURIComponent(id)}`);
    },
    createProject(input) {
      return send<Project>('/projects', 'POST', input);
    },
    updateProject(id, rowVersion, input) {
      return send<Project>(
        `/projects/${encodeURIComponent(id)}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    deleteProject(id, rowVersion, reason) {
      return send<void>(
        `/projects/${encodeURIComponent(id)}`,
        'DELETE',
        { reason },
        rowVersion,
      );
    },
    listProjectAudit(id) {
      return get<ProjectAuditList>(`/projects/${encodeURIComponent(id)}/audit`);
    },
    listCompanies(query = {}) {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.status) params.set('status', query.status);
      if (query.cursor) params.set('cursor', query.cursor);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return get<CompanyList>(`/companies${suffix}`);
    },
    getCompany(id) {
      return get<Company>(`/companies/${encodeURIComponent(id)}`);
    },
    createCompany(input) {
      return send<Company>('/companies', 'POST', input);
    },
    updateCompany(id, rowVersion, input) {
      return send<Company>(
        `/companies/${encodeURIComponent(id)}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    deleteCompany(id, rowVersion, reason) {
      return send<void>(
        `/companies/${encodeURIComponent(id)}`,
        'DELETE',
        { reason },
        rowVersion,
      );
    },
    listCompanyAudit(id) {
      return get<CompanyAuditList>(
        `/companies/${encodeURIComponent(id)}/audit`,
      );
    },
    listCompanyContacts(query = {}) {
      const params = new URLSearchParams();
      if (query.companyId) params.set('companyId', query.companyId);
      if (query.q) params.set('q', query.q);
      if (query.status) params.set('status', query.status);
      if (query.cursor) params.set('cursor', query.cursor);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return get<CompanyContactList>(`/contacts${suffix}`);
    },
    getCompanyContact(id) {
      return get<CompanyContact>(`/contacts/${encodeURIComponent(id)}`);
    },
    createCompanyContact(input) {
      return send<CompanyContact>('/contacts', 'POST', input);
    },
    updateCompanyContact(id, rowVersion, input) {
      return send<CompanyContact>(
        `/contacts/${encodeURIComponent(id)}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    deleteCompanyContact(id, rowVersion, reason) {
      return send<void>(
        `/contacts/${encodeURIComponent(id)}`,
        'DELETE',
        { reason },
        rowVersion,
      );
    },
    listCompanyContactAudit(id) {
      return get<CompanyContactAuditList>(
        `/contacts/${encodeURIComponent(id)}/audit`,
      );
    },
    listEngineers(query = {}) {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.status) params.set('status', query.status);
      if (query.availabilityStatus)
        params.set('availabilityStatus', query.availabilityStatus);
      if (query.cursor) params.set('cursor', query.cursor);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return get<EngineerList>(`/engineers${suffix}`);
    },
    getEngineer(id) {
      return get<Engineer>(`/engineers/${encodeURIComponent(id)}`);
    },
    createEngineer(input) {
      return send<Engineer>('/engineers', 'POST', input);
    },
    updateEngineer(id, rowVersion, input) {
      return send<Engineer>(
        `/engineers/${encodeURIComponent(id)}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    deleteEngineer(id, rowVersion, reason) {
      return send<void>(
        `/engineers/${encodeURIComponent(id)}`,
        'DELETE',
        { reason },
        rowVersion,
      );
    },
    listEngineerAudit(id) {
      return get<EngineerAuditList>(
        `/engineers/${encodeURIComponent(id)}/audit`,
      );
    },
    getEngineerPrivate(id) {
      return get<EngineerPrivateDetail>(
        `/engineers/${encodeURIComponent(id)}/private`,
      );
    },
    updateEngineerPrivate(id, rowVersion, input) {
      return send<EngineerPrivateDetail>(
        `/engineers/${encodeURIComponent(id)}/private`,
        'PUT',
        input,
        rowVersion,
      );
    },
    listEngineerAffiliations(id) {
      return get<EngineerAffiliationList>(
        `/engineers/${encodeURIComponent(id)}/affiliations`,
      );
    },
    saveEngineerAffiliation(id, affiliationId, rowVersion, input) {
      return send<EngineerAffiliation>(
        `/engineers/${encodeURIComponent(id)}/affiliations/${affiliationId ? encodeURIComponent(affiliationId) : 'new'}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    listEngineerPreferences(id) {
      return get<EngineerPreferenceList>(
        `/engineers/${encodeURIComponent(id)}/preferences`,
      );
    },
    saveEngineerPreference(id, preferenceId, rowVersion, input) {
      return send<EngineerPreference>(
        `/engineers/${encodeURIComponent(id)}/preferences/${preferenceId ? encodeURIComponent(preferenceId) : 'new'}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    listEngineerSkills(id) {
      return get<EngineerSkillList>(
        `/engineers/${encodeURIComponent(id)}/skills`,
      );
    },
    saveEngineerSkill(id, itemId, rowVersion, input) {
      return send<EngineerSkill>(
        `/engineers/${encodeURIComponent(id)}/skills/${itemId ? encodeURIComponent(itemId) : 'new'}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    listEngineerQualifications(id) {
      return get<EngineerQualificationList>(
        `/engineers/${encodeURIComponent(id)}/qualifications`,
      );
    },
    saveEngineerQualification(id, itemId, rowVersion, input) {
      return send<EngineerQualification>(
        `/engineers/${encodeURIComponent(id)}/qualifications/${itemId ? encodeURIComponent(itemId) : 'new'}`,
        'PUT',
        input,
        rowVersion,
      );
    },
  };
}
