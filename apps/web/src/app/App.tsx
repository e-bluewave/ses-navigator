import { useEffect, useState } from 'react';

import { ApiClientError, createProjectsApi } from '../api/client.js';
import type { ProjectsApi } from '../api/client.js';
import type { Project, ProjectStatus } from '../api/generated.js';

const defaultApi = createProjectsApi({
  getAccessToken: () => sessionStorage.getItem('sesn.accessToken'),
});

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

type Route = { page: 'list' } | { page: 'detail'; id: string };

function currentRoute(): Route {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)$/);
  return match
    ? { page: 'detail', id: decodeURIComponent(match[1]!) }
    : { page: 'list' };
}

export function App({ api = defaultApi }: { api?: ProjectsApi }) {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    const handlePopState = () => setRoute(currentRoute());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigate(path: string) {
    window.history.pushState({}, '', path);
    setRoute(currentRoute());
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">SES営業支援</p>
          <h1>SES Navigator</h1>
        </div>
        <span className="environment">案件管理</span>
      </header>
      {route.page === 'list' ? (
        <ProjectList api={api} onOpen={(id) => navigate(`/projects/${id}`)} />
      ) : (
        <ProjectDetail
          api={api}
          id={route.id}
          onBack={() => navigate('/projects')}
        />
      )}
    </main>
  );
}

function ProjectList({
  api,
  onOpen,
}: {
  api: ProjectsApi;
  onOpen: (id: string) => void;
}) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    api
      .listProjects({ limit: 50 })
      .then((result) => active && setProjects(result.items))
      .catch((reason: unknown) => active && setError(reason));
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <section aria-labelledby="projects-heading" className="panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">PROJECTS</p>
          <h2 id="projects-heading">案件一覧</h2>
        </div>
        {projects && <span className="count">{projects.length}件</span>}
      </div>
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
    </section>
  );
}

function ProjectDetail({
  api,
  id,
  onBack,
}: {
  api: ProjectsApi;
  id: string;
  onBack: () => void;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    api
      .getProject(id)
      .then((result) => active && setProject(result))
      .catch((reason: unknown) => active && setError(reason));
    return () => {
      active = false;
    };
  }, [api, id]);

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
        </>
      ) : null}
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

function ErrorNotice({ error }: { error: unknown }) {
  const notFound = error instanceof ApiClientError && error.status === 404;
  const message = notFound
    ? '案件が見つからないか、表示する権限がありません。'
    : '案件を取得できませんでした。時間をおいて再度お試しください。';
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
