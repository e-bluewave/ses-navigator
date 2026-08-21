import type {
  ApiErrorBody,
  AuthContext,
  ListProjectsQuery,
  Project,
  ProjectInput,
  ProjectList,
  ProjectAuditList,
  ProjectExtraction,
  ProjectExtractionReviewInput,
  ProjectEngineerMatch,
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
  ResumeExtraction,
  ResumeExtractionReviewInput,
  Proposal,
  ProposalInput,
  ProposalList,
  ProposalStatusTransitionInput,
  ProposalWinResult,
  ProposalMessageDraft,
  ProposalMessageDraftCreateInput,
  ProposalMessageDraftEditInput,
  ProposalMessageDraftReviewInput,
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
  AccountingPeriod,
  AccountingPeriodList,
  ListAccountingPeriodsQuery,
  AccountingPeriodInput,
  AccountingPeriodTransitionInput,
  AccountingExportBatch,
  AccountingExportList,
  ListAccountingExportsQuery,
  AccountingExportGenerateInput,
  AccountingExportCompletionInput,
  Expense,
  ExpenseList,
  ListExpensesQuery,
  ExpenseInput,
  ExpenseStatusTransitionInput,
  ProfitabilityDashboard,
  ProfitabilityQuery,
  SalesKpiDashboard,
  SalesKpiQuery,
} from './generated.js';

export interface ProjectsApi {
  createProjectEngineerMatch(
    projectId: string,
    limit?: number,
  ): Promise<ProjectEngineerMatch>;
  getLatestProjectEngineerMatch(
    projectId: string,
  ): Promise<ProjectEngineerMatch | null>;
  createProjectExtraction(
    projectId: string,
    sourceText: string,
    sourceTitle: string | null,
  ): Promise<ProjectExtraction>;
  getLatestProjectExtraction(
    projectId: string,
  ): Promise<ProjectExtraction | null>;
  reviewProjectExtraction(
    projectId: string,
    extractionId: string,
    input: ProjectExtractionReviewInput,
  ): Promise<ProjectExtraction>;
  getSalesKpiDashboard(query: SalesKpiQuery): Promise<SalesKpiDashboard>;
  getAuthContext(): Promise<AuthContext>;
  getProfitabilityDashboard(
    query: ProfitabilityQuery,
  ): Promise<ProfitabilityDashboard>;
  listExpenses(query?: ListExpensesQuery): Promise<ExpenseList>;
  getExpense(id: string): Promise<Expense>;
  createExpense(input: ExpenseInput): Promise<Expense>;
  updateExpense(
    id: string,
    rowVersion: number,
    input: ExpenseInput,
  ): Promise<Expense>;
  transitionExpenseStatus(
    id: string,
    rowVersion: number,
    input: ExpenseStatusTransitionInput,
  ): Promise<Expense>;
  listAccountingExports(
    query?: ListAccountingExportsQuery,
  ): Promise<AccountingExportList>;
  getAccountingExport(id: string): Promise<AccountingExportBatch>;
  generateAccountingExport(
    input: AccountingExportGenerateInput,
  ): Promise<AccountingExportBatch>;
  markAccountingExported(
    id: string,
    rowVersion: number,
    input: AccountingExportCompletionInput,
  ): Promise<AccountingExportBatch>;
  listAccountingPeriods(
    query?: ListAccountingPeriodsQuery,
  ): Promise<AccountingPeriodList>;
  getAccountingPeriod(id: string): Promise<AccountingPeriod>;
  createAccountingPeriod(
    input: AccountingPeriodInput,
  ): Promise<AccountingPeriod>;
  transitionAccountingPeriodStatus(
    id: string,
    rowVersion: number,
    input: AccountingPeriodTransitionInput,
  ): Promise<AccountingPeriod>;
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
  createProposalMessageDraft(
    id: string,
    input?: ProposalMessageDraftCreateInput,
  ): Promise<ProposalMessageDraft>;
  getLatestProposalMessageDraft(
    id: string,
  ): Promise<ProposalMessageDraft | null>;
  updateProposalMessageDraft(
    proposalId: string,
    messageId: string,
    rowVersion: number,
    input: ProposalMessageDraftEditInput,
  ): Promise<ProposalMessageDraft>;
  reviewProposalMessageDraft(
    proposalId: string,
    messageId: string,
    rowVersion: number,
    input: ProposalMessageDraftReviewInput,
  ): Promise<ProposalMessageDraft>;
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
  createResumeExtraction(
    engineerId: string,
    versionId: string,
    sourceText: string,
  ): Promise<ResumeExtraction>;
  getLatestResumeExtraction(
    engineerId: string,
    versionId: string,
  ): Promise<ResumeExtraction | null>;
  reviewResumeExtraction(
    engineerId: string,
    versionId: string,
    extractionId: string,
    input: ResumeExtractionReviewInput,
  ): Promise<ResumeExtraction>;
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
    getSalesKpiDashboard(query) {
      const params = new URLSearchParams({
        fromDate: query.fromDate,
        toDate: query.toDate,
      });
      if (query.contractExpiryDays !== undefined)
        params.set('contractExpiryDays', String(query.contractExpiryDays));
      return get<SalesKpiDashboard>(`/sales-kpi?${params.toString()}`);
    },
    getAuthContext() {
      return get<AuthContext>('/auth/context');
    },
    getProfitabilityDashboard(query) {
      const params = new URLSearchParams({
        fromMonth: query.fromMonth,
        toMonth: query.toMonth,
      });
      if (query.currency) params.set('currency', query.currency);
      return get<ProfitabilityDashboard>(`/profitability?${params.toString()}`);
    },
    listExpenses(query = {}) {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.status) params.set('status', query.status);
      if (query.dateFrom) params.set('dateFrom', query.dateFrom);
      if (query.dateTo) params.set('dateTo', query.dateTo);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return get<ExpenseList>(`/expenses${suffix}`);
    },
    getExpense(id) {
      return get<Expense>(`/expenses/${encodeURIComponent(id)}`);
    },
    createExpense(input) {
      return send<Expense>('/expenses', 'POST', input);
    },
    updateExpense(id, rowVersion, input) {
      return send<Expense>(
        `/expenses/${encodeURIComponent(id)}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    createProjectExtraction(projectId, sourceText, sourceTitle) {
      return send<ProjectExtraction>(
        `/projects/${encodeURIComponent(projectId)}/extractions`,
        'POST',
        { sourceText, sourceTitle },
      );
    },
    getLatestProjectExtraction(projectId) {
      return get<ProjectExtraction | null>(
        `/projects/${encodeURIComponent(projectId)}/extractions/latest`,
      );
    },
    reviewProjectExtraction(projectId, extractionId, input) {
      return send<ProjectExtraction>(
        `/projects/${encodeURIComponent(projectId)}/extractions/${encodeURIComponent(extractionId)}/review`,
        'POST',
        input,
      );
    },
    createProjectEngineerMatch(projectId, limit = 5) {
      return send<ProjectEngineerMatch>(
        `/projects/${encodeURIComponent(projectId)}/ai/match-engineers`,
        'POST',
        { limit },
      );
    },
    getLatestProjectEngineerMatch(projectId) {
      return get<ProjectEngineerMatch | null>(
        `/projects/${encodeURIComponent(projectId)}/ai/matches/latest`,
      );
    },
    transitionExpenseStatus(id, rowVersion, input) {
      return send<Expense>(
        `/expenses/${encodeURIComponent(id)}/status`,
        'POST',
        input,
        rowVersion,
      );
    },
    listAccountingExports(query = {}) {
      const params = new URLSearchParams();
      if (query.accountingPeriodId)
        params.set('accountingPeriodId', query.accountingPeriodId);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return get<AccountingExportList>(`/accounting-exports${suffix}`);
    },
    getAccountingExport(id) {
      return get<AccountingExportBatch>(
        `/accounting-exports/${encodeURIComponent(id)}`,
      );
    },
    generateAccountingExport(input) {
      return send<AccountingExportBatch>('/accounting-exports', 'POST', input);
    },
    markAccountingExported(id, rowVersion, input) {
      return send<AccountingExportBatch>(
        `/accounting-exports/${encodeURIComponent(id)}/exported`,
        'POST',
        input,
        rowVersion,
      );
    },
    listAccountingPeriods(query = {}) {
      const params = new URLSearchParams();
      if (query.fromMonth) params.set('fromMonth', query.fromMonth);
      if (query.toMonth) params.set('toMonth', query.toMonth);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.size === 0 ? '' : `?${params.toString()}`;
      return get<AccountingPeriodList>(`/accounting-periods${suffix}`);
    },
    getAccountingPeriod(id) {
      return get<AccountingPeriod>(
        `/accounting-periods/${encodeURIComponent(id)}`,
      );
    },
    createAccountingPeriod(input) {
      return send<AccountingPeriod>('/accounting-periods', 'POST', input);
    },
    transitionAccountingPeriodStatus(id, rowVersion, input) {
      return send<AccountingPeriod>(
        `/accounting-periods/${encodeURIComponent(id)}/status`,
        'POST',
        input,
        rowVersion,
      );
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
    createProposalMessageDraft(id, input = {}) {
      return send<ProposalMessageDraft>(
        `/proposals/${encodeURIComponent(id)}/ai/message-drafts`,
        'POST',
        input,
      );
    },
    getLatestProposalMessageDraft(id) {
      return get<ProposalMessageDraft | null>(
        `/proposals/${encodeURIComponent(id)}/ai/message-drafts/latest`,
      );
    },
    updateProposalMessageDraft(proposalId, messageId, rowVersion, input) {
      return send<ProposalMessageDraft>(
        `/proposals/${encodeURIComponent(proposalId)}/ai/message-drafts/${encodeURIComponent(messageId)}`,
        'PUT',
        input,
        rowVersion,
      );
    },
    reviewProposalMessageDraft(proposalId, messageId, rowVersion, input) {
      return send<ProposalMessageDraft>(
        `/proposals/${encodeURIComponent(proposalId)}/ai/message-drafts/${encodeURIComponent(messageId)}/review`,
        'POST',
        input,
        rowVersion,
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
    createResumeExtraction(engineerId, versionId, sourceText) {
      return send<ResumeExtraction>(
        `/engineers/${encodeURIComponent(engineerId)}/resume-versions/${encodeURIComponent(versionId)}/extractions`,
        'POST',
        { sourceText },
      );
    },
    getLatestResumeExtraction(engineerId, versionId) {
      return get<ResumeExtraction | null>(
        `/engineers/${encodeURIComponent(engineerId)}/resume-versions/${encodeURIComponent(versionId)}/extractions/latest`,
      );
    },
    reviewResumeExtraction(engineerId, versionId, extractionId, input) {
      return send<ResumeExtraction>(
        `/engineers/${encodeURIComponent(engineerId)}/resume-versions/${encodeURIComponent(versionId)}/extractions/${encodeURIComponent(extractionId)}/review`,
        'POST',
        input,
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
