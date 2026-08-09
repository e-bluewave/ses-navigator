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
} from './generated.js';

export interface ProjectsApi {
  getAuthContext(): Promise<AuthContext>;
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
}): ProjectsApi {
  const baseUrl = options.baseUrl ?? '/api/v1';
  const request = options.fetch ?? fetch;

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
  ): Promise<T> {
    const token = options.getAccessToken();
    const response = await request(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
        ...(rowVersion === undefined ? {} : { 'if-match': `"${rowVersion}"` }),
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
