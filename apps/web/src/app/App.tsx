import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { ApiClientError, createProjectsApi } from '../api/client.js';
import type { ProjectsApi } from '../api/client.js';
import type {
  Company,
  CompanyStatus,
  CompanyInput,
  Project,
  ProjectStatus,
  RecruitmentStatus,
  ProjectInput,
} from '../api/generated.js';
import { AuthProvider, useAuth } from '../auth/AuthProvider.js';
import { LoginPage } from '../auth/LoginPage.js';
import { MfaPage } from '../auth/MfaPage.js';
import { PasswordUpdatePage } from '../auth/PasswordUpdatePage.js';
import type { AuthService } from '../auth/auth-client.js';

const projectStatusLabels: Record<ProjectStatus, string> = {
  draft: '下書き',
  open: '募集中',
  on_hold: '保留',
  closed: '終了',
  cancelled: '中止',
};

const recruitmentStatusLabels = {
  recruiting: '要員募集中',
  paused: '募集停止',
  filled: '充足',
  ended: '募集終了',
} as const;

type Route =
  | { page: 'list' }
  | { page: 'detail'; id: string }
  | { page: 'new' }
  | { page: 'edit'; id: string }
  | { page: 'companies' }
  | { page: 'company-detail'; id: string }
  | { page: 'company-new' }
  | { page: 'company-edit'; id: string };

function currentRoute(): Route {
  if (window.location.pathname === '/companies') return { page: 'companies' };
  if (window.location.pathname === '/companies/new')
    return { page: 'company-new' };
  const companyEdit = window.location.pathname.match(
    /^\/companies\/([^/]+)\/edit$/,
  );
  if (companyEdit)
    return { page: 'company-edit', id: decodeURIComponent(companyEdit[1]!) };
  const company = window.location.pathname.match(/^\/companies\/([^/]+)$/);
  if (company)
    return { page: 'company-detail', id: decodeURIComponent(company[1]!) };
  if (window.location.pathname === '/projects/new') return { page: 'new' };
  const edit = window.location.pathname.match(/^\/projects\/([^/]+)\/edit$/);
  if (edit) return { page: 'edit', id: decodeURIComponent(edit[1]!) };
  const match = window.location.pathname.match(/^\/projects\/([^/]+)$/);
  return match
    ? { page: 'detail', id: decodeURIComponent(match[1]!) }
    : { page: 'list' };
}

export function App({ auth, api }: { auth: AuthService; api?: ProjectsApi }) {
  return (
    <AuthProvider auth={auth}>
      <AuthenticatedApp {...(api === undefined ? {} : { api })} />
    </AuthProvider>
  );
}

function AuthenticatedApp({ api: providedApi }: { api?: ProjectsApi }) {
  const { loading, session, signOut, consumeAuthCallback } = useAuth();
  const [callback, setCallback] = useState<'recovery' | 'invite' | null>(null);
  const [callbackLoading, setCallbackLoading] = useState(
    window.location.pathname === '/auth/callback',
  );
  const [callbackError, setCallbackError] = useState(false);

  useEffect(() => {
    if (window.location.pathname !== '/auth/callback') return;
    void consumeAuthCallback(window.location.href)
      .then((kind) => {
        window.history.replaceState({}, '', '/auth/callback');
        if (kind === null) setCallbackError(true);
        else setCallback(kind);
      })
      .catch(() => {
        window.history.replaceState({}, '', '/auth/callback');
        setCallbackError(true);
      })
      .finally(() => setCallbackLoading(false));
  }, [consumeAuthCallback]);
  const api = useMemo(
    () =>
      providedApi ??
      createProjectsApi({ getAccessToken: () => session?.accessToken ?? null }),
    [providedApi, session?.accessToken],
  );
  const [route, setRoute] = useState<Route>(currentRoute);
  const [requiresMfa, setRequiresMfa] = useState<boolean | null>(null);

  useEffect(() => {
    if (session === null) {
      setRequiresMfa(null);
      return;
    }
    void api
      .getAuthContext()
      .then((context) => setRequiresMfa(context.requiresMfa))
      .catch(() => setRequiresMfa(true));
  }, [api, session]);

  useEffect(() => {
    const handlePopState = () => setRoute(currentRoute());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigate(path: string) {
    window.history.pushState({}, '', path);
    setRoute(currentRoute());
  }

  if (loading || callbackLoading)
    return (
      <main className="auth-loading" role="status">
        認証状態を確認しています…
      </main>
    );
  if (callbackError)
    return (
      <main className="login-shell">
        <section className="login-panel">
          <h1>認証リンクを確認できません</h1>
          <p role="alert">
            リンクが無効または期限切れです。再度手続きを行ってください。
          </p>
        </section>
      </main>
    );
  if (callback && session)
    return (
      <PasswordUpdatePage
        kind={callback}
        onComplete={() => {
          setCallback(null);
          window.history.replaceState({}, '', '/projects');
        }}
      />
    );
  if (session === null) return <LoginPage />;
  if (requiresMfa === null)
    return (
      <main className="auth-loading" role="status">
        権限を確認しています…
      </main>
    );
  if (requiresMfa && session.assuranceLevel !== 'aal2') return <MfaPage />;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">SES営業支援</p>
          <h1>SES Navigator</h1>
        </div>
        <div className="account-actions">
          <span className="account-email">{session.user.email}</span>
          <button className="secondary-button" onClick={() => void signOut()}>
            ログアウト
          </button>
        </div>
      </header>
      <nav className="module-navigation" aria-label="主要機能">
        <button
          className="secondary-button"
          onClick={() => navigate('/projects')}
        >
          案件
        </button>
        <button
          className="secondary-button"
          onClick={() => navigate('/companies')}
        >
          会社
        </button>
      </nav>
      {route.page === 'list' ? (
        <ProjectList
          api={api}
          onOpen={(id) => navigate(`/projects/${id}`)}
          onUnauthorized={signOut}
          onCreate={() => navigate('/projects/new')}
        />
      ) : route.page === 'companies' ? (
        <CompanyList
          api={api}
          onOpen={(id) => navigate(`/companies/${id}`)}
          onUnauthorized={signOut}
          onCreate={() => navigate('/companies/new')}
        />
      ) : route.page === 'company-detail' ? (
        <CompanyDetail
          api={api}
          id={route.id}
          onBack={() => navigate('/companies')}
          onUnauthorized={signOut}
          onEdit={() => navigate(`/companies/${route.id}/edit`)}
        />
      ) : route.page === 'company-new' || route.page === 'company-edit' ? (
        <CompanyForm
          api={api}
          {...(route.page === 'company-edit' ? { id: route.id } : {})}
          onCancel={() =>
            navigate(
              route.page === 'company-edit'
                ? `/companies/${route.id}`
                : '/companies',
            )
          }
          onSaved={(id) => navigate(`/companies/${id}`)}
        />
      ) : route.page === 'detail' ? (
        <ProjectDetail
          api={api}
          id={route.id}
          onBack={() => navigate('/projects')}
          onUnauthorized={signOut}
          onEdit={() => navigate(`/projects/${route.id}/edit`)}
          onDeleted={() => navigate('/projects')}
        />
      ) : (
        <ProjectForm
          api={api}
          {...(route.page === 'edit' ? { id: route.id } : {})}
          onCancel={() =>
            navigate(
              route.page === 'edit' ? `/projects/${route.id}` : '/projects',
            )
          }
          onSaved={(id) => navigate(`/projects/${id}`)}
        />
      )}
    </main>
  );
}

const companyStatusLabels: Record<CompanyStatus, string> = {
  prospect: '見込み',
  active: '取引中',
  inactive: '休眠',
  blocked: '取引停止',
};

function CompanyList({
  api,
  onOpen,
  onUnauthorized,
  onCreate,
}: {
  api: ProjectsApi;
  onOpen: (id: string) => void;
  onUnauthorized: () => Promise<void>;
  onCreate: () => void;
}) {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CompanyStatus | ''>('');
  const [filters, setFilters] = useState<{
    query: string;
    status: CompanyStatus | '';
  }>({ query: '', status: '' });
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    setCompanies(null);
    setError(null);
    api
      .listCompanies({
        limit: 50,
        ...(filters.query ? { q: filters.query } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      })
      .then((result) => {
        if (active) setCompanies(result.items);
      })
      .catch((reason: unknown) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          void onUnauthorized();
        else if (active) setError(reason);
      });
    return () => {
      active = false;
    };
  }, [api, filters, onUnauthorized]);
  return (
    <section className="panel" aria-labelledby="companies-heading">
      <div className="section-heading">
        <div>
          <p className="section-kicker">COMPANIES</p>
          <h2 id="companies-heading">会社一覧</h2>
        </div>
        <div className="account-actions">
          {companies && <span className="count">{companies.length}件</span>}
          <button className="primary-button" onClick={onCreate}>
            会社を登録
          </button>
        </div>
      </div>
      <form
        className="project-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ query: query.trim(), status });
        }}
      >
        <label>
          会社検索
          <input
            type="search"
            value={query}
            maxLength={100}
            placeholder="管理番号・会社名"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          会社状態
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as CompanyStatus | '')
            }
          >
            <option value="">すべて</option>
            {Object.entries(companyStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button" type="submit">
          検索
        </button>
      </form>
      {error ? (
        <p role="alert">会社一覧を読み込めませんでした。</p>
      ) : companies === null ? (
        <p role="status">会社を読み込んでいます…</p>
      ) : companies.length === 0 ? (
        <p>表示できる会社はありません。</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>管理番号</th>
                <th>会社名</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id} onClick={() => onOpen(company.id)}>
                  <td>
                    <button className="link-button">
                      {company.managementNo}
                    </button>
                  </td>
                  <td>{company.displayName ?? company.legalName}</td>
                  <td>{companyStatusLabels[company.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CompanyDetail({
  api,
  id,
  onBack,
  onUnauthorized,
  onEdit,
}: {
  api: ProjectsApi;
  id: string;
  onBack: () => void;
  onUnauthorized: () => Promise<void>;
  onEdit: () => void;
}) {
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    api
      .getCompany(id)
      .then((value) => {
        if (active) setCompany(value);
      })
      .catch((reason: unknown) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          void onUnauthorized();
        else if (active) setError(reason);
      });
    return () => {
      active = false;
    };
  }, [api, id, onUnauthorized]);
  return (
    <section className="panel" aria-labelledby="company-heading">
      <button className="secondary-button" onClick={onBack}>
        会社一覧へ戻る
      </button>
      {error ? (
        <p role="alert">会社詳細を読み込めませんでした。</p>
      ) : company === null ? (
        <p role="status">会社を読み込んでいます…</p>
      ) : (
        <>
          <div className="section-heading">
            <div>
              <p className="section-kicker">{company.managementNo}</p>
              <h2 id="company-heading">
                {company.displayName ?? company.legalName}
              </h2>
            </div>
            <span className="status-badge">
              {companyStatusLabels[company.status]}
            </span>
            <button className="primary-button" onClick={onEdit}>
              編集
            </button>
          </div>
          <dl className="detail-grid">
            <div>
              <dt>正式名称</dt>
              <dd>{company.legalName}</dd>
            </div>
            <div>
              <dt>法人番号</dt>
              <dd>{company.corporateNumber ?? '未登録'}</dd>
            </div>
            <div>
              <dt>代表者</dt>
              <dd>{company.representativeName ?? '未登録'}</dd>
            </div>
            <div>
              <dt>所在地</dt>
              <dd>
                {[
                  company.postalCode,
                  company.prefecture,
                  company.city,
                  company.addressLine,
                ]
                  .filter(Boolean)
                  .join(' ') || '未登録'}
              </dd>
            </div>
            <div>
              <dt>Webサイト</dt>
              <dd>
                {company.websiteUrl ? (
                  <a href={company.websiteUrl} target="_blank" rel="noreferrer">
                    {company.websiteUrl}
                  </a>
                ) : (
                  '未登録'
                )}
              </dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}

function CompanyForm({
  api,
  id,
  onCancel,
  onSaved,
}: {
  api: ProjectsApi;
  id?: string;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const empty: CompanyInput = {
    managementNo: '',
    legalName: '',
    displayName: null,
    corporateNumber: null,
    postalCode: null,
    prefecture: null,
    city: null,
    addressLine: null,
    websiteUrl: null,
    representativeName: null,
    status: 'prospect',
  };
  const [input, setInput] = useState<CompanyInput>(empty);
  const [rowVersion, setRowVersion] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!id) return;
    void api
      .getCompany(id)
      .then((company) => {
        setInput({
          managementNo: company.managementNo,
          legalName: company.legalName,
          displayName: company.displayName,
          corporateNumber: company.corporateNumber,
          postalCode: company.postalCode,
          prefecture: company.prefecture,
          city: company.city,
          addressLine: company.addressLine,
          websiteUrl: company.websiteUrl,
          representativeName: company.representativeName,
          status: company.status,
        });
        setRowVersion(company.rowVersion);
      })
      .catch(setError);
  }, [api, id]);
  const set = (name: keyof CompanyInput, value: string) =>
    setInput((current) => ({
      ...current,
      [name]:
        value === '' && !['managementNo', 'legalName', 'status'].includes(name)
          ? null
          : value,
    }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = id
        ? await api.updateCompany(id, rowVersion!, input)
        : await api.createCompany(input);
      onSaved(saved.id);
    } catch (reason) {
      setError(reason);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="panel">
      <h2>{id ? '会社編集' : '会社登録'}</h2>
      {error ? <ErrorNotice error={error} subject="会社" /> : null}
      <form className="project-form" onSubmit={(event) => void submit(event)}>
        <label>
          管理番号
          <input
            required
            maxLength={32}
            value={input.managementNo}
            onChange={(e) => set('managementNo', e.target.value)}
          />
        </label>
        <label>
          正式名称
          <input
            required
            maxLength={200}
            value={input.legalName}
            onChange={(e) => set('legalName', e.target.value)}
          />
        </label>
        <label>
          表示名
          <input
            maxLength={200}
            value={input.displayName ?? ''}
            onChange={(e) => set('displayName', e.target.value)}
          />
        </label>
        <label>
          法人番号
          <input
            pattern="[0-9]{13}"
            maxLength={13}
            value={input.corporateNumber ?? ''}
            onChange={(e) => set('corporateNumber', e.target.value)}
          />
        </label>
        <label>
          郵便番号
          <input
            maxLength={8}
            value={input.postalCode ?? ''}
            onChange={(e) => set('postalCode', e.target.value)}
          />
        </label>
        <label>
          都道府県
          <input
            maxLength={100}
            value={input.prefecture ?? ''}
            onChange={(e) => set('prefecture', e.target.value)}
          />
        </label>
        <label>
          市区町村
          <input
            maxLength={100}
            value={input.city ?? ''}
            onChange={(e) => set('city', e.target.value)}
          />
        </label>
        <label>
          住所
          <input
            maxLength={500}
            value={input.addressLine ?? ''}
            onChange={(e) => set('addressLine', e.target.value)}
          />
        </label>
        <label>
          Webサイト
          <input
            type="url"
            maxLength={2048}
            value={input.websiteUrl ?? ''}
            onChange={(e) => set('websiteUrl', e.target.value)}
          />
        </label>
        <label>
          代表者
          <input
            maxLength={200}
            value={input.representativeName ?? ''}
            onChange={(e) => set('representativeName', e.target.value)}
          />
        </label>
        <label>
          会社状態
          <select
            value={input.status}
            onChange={(e) => set('status', e.target.value)}
          >
            {Object.entries(companyStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="account-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            キャンセル
          </button>
          <button className="primary-button" disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </form>
    </section>
  );
}

function ProjectList({
  api,
  onOpen,
  onUnauthorized,
  onCreate,
}: {
  api: ProjectsApi;
  onOpen: (id: string) => void;
  onUnauthorized: () => Promise<void>;
  onCreate: () => void;
}) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ProjectStatus | ''>('');
  const [recruitmentStatus, setRecruitmentStatus] = useState<
    RecruitmentStatus | ''
  >('');
  const [filters, setFilters] = useState({
    query: '',
    status: '',
    recruitmentStatus: '',
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    setProjects(null);
    setError(null);
    api
      .listProjects({
        limit: 50,
        ...(filters.query ? { q: filters.query } : {}),
        ...(filters.status ? { status: filters.status as ProjectStatus } : {}),
        ...(filters.recruitmentStatus
          ? {
              recruitmentStatus: filters.recruitmentStatus as RecruitmentStatus,
            }
          : {}),
      })
      .then((result) => {
        if (!active) return;
        setProjects(result.items);
        setNextCursor(result.page.nextCursor);
      })
      .catch((reason: unknown) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          void onUnauthorized();
        else if (active) setError(reason);
      });
    return () => {
      active = false;
    };
  }, [api, filters, onUnauthorized]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setFilters({ query: query.trim(), status, recruitmentStatus });
  }

  async function loadMore() {
    if (nextCursor === null) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await api.listProjects({
        limit: 50,
        cursor: nextCursor,
        ...(filters.query ? { q: filters.query } : {}),
        ...(filters.status ? { status: filters.status as ProjectStatus } : {}),
        ...(filters.recruitmentStatus
          ? {
              recruitmentStatus: filters.recruitmentStatus as RecruitmentStatus,
            }
          : {}),
      });
      setProjects((current) => [...(current ?? []), ...result.items]);
      setNextCursor(result.page.nextCursor);
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.status === 401)
        await onUnauthorized();
      else setError(reason);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section aria-labelledby="projects-heading" className="panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">PROJECTS</p>
          <h2 id="projects-heading">案件一覧</h2>
        </div>
        <div className="account-actions">
          <button className="primary-button" onClick={onCreate}>
            案件を登録
          </button>
          {projects && <span className="count">{projects.length}件</span>}
        </div>
      </div>
      <form className="project-filters" onSubmit={applyFilters}>
        <label>
          案件検索
          <input
            type="search"
            value={query}
            maxLength={100}
            placeholder="管理番号・案件名"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          案件状態
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as ProjectStatus | '')
            }
          >
            <option value="">すべて</option>
            {Object.entries(projectStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          募集状態
          <select
            value={recruitmentStatus}
            onChange={(event) =>
              setRecruitmentStatus(event.target.value as RecruitmentStatus | '')
            }
          >
            <option value="">すべて</option>
            {Object.entries(recruitmentStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button" type="submit">
          検索
        </button>
      </form>
      {error ? <ErrorNotice error={error} /> : null}
      {projects === null && error === null ? (
        <p role="status">案件を読み込んでいます…</p>
      ) : null}
      {projects?.length === 0 ? (
        <p className="empty">表示できる案件はありません。</p>
      ) : null}
      {projects && projects.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>管理番号</th>
                <th>案件名</th>
                <th>案件状態</th>
                <th>募集状態</th>
                <th>開始予定</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td className="mono">{project.managementNo}</td>
                  <td>
                    <button
                      className="project-link"
                      onClick={() => onOpen(project.id)}
                    >
                      {project.projectName}
                    </button>
                  </td>
                  <td>
                    <Status
                      value={project.projectStatus}
                      label={projectStatusLabels[project.projectStatus]}
                    />
                  </td>
                  <td>{recruitmentStatusLabels[project.recruitmentStatus]}</td>
                  <td>{formatDate(project.plannedStartOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {projects && nextCursor ? (
        <div className="pagination-actions">
          <button
            className="secondary-button"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? '読み込んでいます…' : 'さらに表示'}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ProjectDetail({
  api,
  id,
  onBack,
  onUnauthorized,
  onEdit,
  onDeleted,
}: {
  api: ProjectsApi;
  id: string;
  onBack: () => void;
  onUnauthorized: () => Promise<void>;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [auditEvents, setAuditEvents] = useState<
    Awaited<ReturnType<ProjectsApi['listProjectAudit']>>['items'] | null
  >(null);
  const [auditError, setAuditError] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getProject(id)
      .then((result) => active && setProject(result))
      .catch((reason: unknown) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          void onUnauthorized();
        else if (active) setError(reason);
      });
    return () => {
      active = false;
    };
  }, [api, id, onUnauthorized]);

  async function removeProject(event: FormEvent) {
    event.preventDefault();
    if (!project) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteProject(project.id, project.rowVersion, deleteReason);
      onDeleted();
    } catch (reason) {
      setError(reason);
    } finally {
      setDeleting(false);
    }
  }

  async function loadAudit() {
    setAuditError(false);
    try {
      setAuditEvents((await api.listProjectAudit(id)).items);
    } catch {
      setAuditError(true);
    }
  }

  return (
    <section aria-labelledby="project-heading" className="panel">
      <button className="back-link" onClick={onBack}>
        ← 案件一覧へ
      </button>
      {error ? <ErrorNotice error={error} /> : null}
      {project === null && error === null ? (
        <p role="status">案件を読み込んでいます…</p>
      ) : null}
      {project ? (
        <>
          <div className="detail-heading">
            <div>
              <p className="section-kicker mono">{project.managementNo}</p>
              <h2 id="project-heading">{project.projectName}</h2>
            </div>
            <Status
              value={project.projectStatus}
              label={projectStatusLabels[project.projectStatus]}
            />
            <button className="primary-button" onClick={onEdit}>
              編集
            </button>
            <button
              className="secondary-button"
              onClick={() => void loadAudit()}
            >
              監査履歴
            </button>
            <button
              className="danger-button"
              onClick={() => setShowDelete(true)}
            >
              削除
            </button>
          </div>
          <p className="summary">
            {project.summary ?? '概要は登録されていません。'}
          </p>
          <dl className="detail-grid">
            <Detail
              label="募集状態"
              value={recruitmentStatusLabels[project.recruitmentStatus]}
            />
            <Detail
              label="開始予定日"
              value={formatDate(project.plannedStartOn)}
            />
            <Detail
              label="終了予定日"
              value={formatDate(project.plannedEndOn)}
            />
            <Detail
              label="最終更新"
              value={formatDateTime(project.updatedAt)}
            />
          </dl>
          {showDelete ? (
            <form
              className="delete-panel"
              onSubmit={(event) => void removeProject(event)}
            >
              <h3>案件を削除</h3>
              <p>
                一覧から非表示になります。削除理由と操作履歴は監査ログへ保存されます。
              </p>
              <label>
                削除理由
                <textarea
                  required
                  maxLength={500}
                  value={deleteReason}
                  onChange={(event) => setDeleteReason(event.target.value)}
                />
              </label>
              <div className="account-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowDelete(false)}
                >
                  キャンセル
                </button>
                <button
                  className="danger-button"
                  disabled={deleting || deleteReason.trim() === ''}
                >
                  {deleting ? '削除中…' : '論理削除する'}
                </button>
              </div>
            </form>
          ) : null}
          {auditError ? (
            <p className="error" role="alert">
              監査履歴を表示する権限がないか、取得に失敗しました。
            </p>
          ) : null}
          {auditEvents ? (
            <section className="audit-panel" aria-labelledby="audit-heading">
              <h3 id="audit-heading">監査履歴</h3>
              {auditEvents.length === 0 ? (
                <p>監査履歴はありません。</p>
              ) : (
                <ul>
                  {auditEvents.map((event) => (
                    <li key={event.id}>
                      <strong>{event.action}</strong>
                      <span>{formatDateTime(event.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function ProjectForm({
  api,
  id,
  onCancel,
  onSaved,
}: {
  api: ProjectsApi;
  id?: string;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const empty: ProjectInput = {
    managementNo: '',
    projectName: '',
    summary: null,
    projectStatus: 'draft',
    recruitmentStatus: 'recruiting',
    plannedStartOn: null,
    plannedEndOn: null,
  };
  const [input, setInput] = useState<ProjectInput>(empty);
  const [rowVersion, setRowVersion] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!id) return;
    void api
      .getProject(id)
      .then((p) => {
        setInput({
          managementNo: p.managementNo,
          projectName: p.projectName,
          summary: p.summary,
          projectStatus: p.projectStatus,
          recruitmentStatus: p.recruitmentStatus,
          plannedStartOn: p.plannedStartOn,
          plannedEndOn: p.plannedEndOn,
        });
        setRowVersion(p.rowVersion);
      })
      .catch(setError);
  }, [api, id]);
  const set = (name: keyof ProjectInput, value: string) =>
    setInput((v) => ({
      ...v,
      [name]:
        value === '' &&
        ['summary', 'plannedStartOn', 'plannedEndOn'].includes(name)
          ? null
          : value,
    }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = id
        ? await api.updateProject(id, rowVersion!, input)
        : await api.createProject(input);
      onSaved(saved.id);
    } catch (reason) {
      setError(reason);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="panel">
      <h2>{id ? '案件編集' : '案件登録'}</h2>
      {error ? <ErrorNotice error={error} /> : null}
      <form className="project-form" onSubmit={(e) => void submit(e)}>
        <label>
          管理番号
          <input
            required
            maxLength={32}
            value={input.managementNo}
            onChange={(e) => set('managementNo', e.target.value)}
          />
        </label>
        <label>
          案件名
          <input
            required
            maxLength={200}
            value={input.projectName}
            onChange={(e) => set('projectName', e.target.value)}
          />
        </label>
        <label>
          概要
          <textarea
            maxLength={4000}
            value={input.summary ?? ''}
            onChange={(e) => set('summary', e.target.value)}
          />
        </label>
        <label>
          案件状態
          <select
            value={input.projectStatus}
            onChange={(e) => set('projectStatus', e.target.value)}
          >
            {Object.entries(projectStatusLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          募集状態
          <select
            value={input.recruitmentStatus}
            onChange={(e) => set('recruitmentStatus', e.target.value)}
          >
            {Object.entries(recruitmentStatusLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          開始予定日
          <input
            type="date"
            value={input.plannedStartOn ?? ''}
            onChange={(e) => set('plannedStartOn', e.target.value)}
          />
        </label>
        <label>
          終了予定日
          <input
            type="date"
            value={input.plannedEndOn ?? ''}
            onChange={(e) => set('plannedEndOn', e.target.value)}
          />
        </label>
        <div className="account-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            キャンセル
          </button>
          <button className="primary-button" disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </form>
    </section>
  );
}

function Status({ value, label }: { value: string; label: string }) {
  return <span className={`status status-${value}`}>{label}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ErrorNotice({
  error,
  subject = '案件',
}: {
  error: unknown;
  subject?: string;
}) {
  const notFound = error instanceof ApiClientError && error.status === 404;
  const message = notFound
    ? `${subject}が見つからないか、表示する権限がありません。`
    : `${subject}を取得できませんでした。時間をおいて再度お試しください。`;
  return (
    <div className="error" role="alert">
      <strong>{message}</strong>
      {error instanceof ApiClientError && error.requestId ? (
        <small>Request ID: {error.requestId}</small>
      ) : null}
    </div>
  );
}

function formatDate(value: string | null): string {
  return value === null
    ? '未定'
    : new Intl.DateTimeFormat('ja-JP').format(new Date(`${value}T00:00:00Z`));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
