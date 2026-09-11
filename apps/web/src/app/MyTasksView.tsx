import { useCallback, useEffect, useMemo, useState } from 'react';

import { ApiClientError } from '../api/client.js';
import type { ProjectsApi } from '../api/client.js';
import type { ListMyTasksQuery, MyTask, TaskStatus } from '../api/generated.js';

interface MyTasksViewProps {
  api: ProjectsApi;
  onNavigate: (path: string) => void;
  onUnauthorized: () => Promise<void>;
}

const scopes: Array<{
  value: NonNullable<ListMyTasksQuery['scope']>;
  label: string;
}> = [
  { value: 'incomplete', label: '未完了' },
  { value: 'overdue', label: '期限切れ' },
  { value: 'today', label: '今日' },
  { value: 'upcoming', label: '今後' },
  { value: 'completed', label: '完了' },
  { value: 'all', label: 'すべて' },
];

const statusLabels: Record<TaskStatus, string> = {
  open: '未着手',
  in_progress: '対応中',
  blocked: 'ブロック',
  completed: '完了',
  cancelled: '取消',
};

const priorityLabels = {
  low: '低',
  normal: '通常',
  high: '高',
  urgent: '緊急',
};

export function MyTasksView({
  api,
  onNavigate,
  onUnauthorized,
}: MyTasksViewProps) {
  const [scope, setScope] =
    useState<NonNullable<ListMyTasksQuery['scope']>>('incomplete');
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo',
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.listMyTasks({ scope, timeZone, limit: 100 });
      setTasks(result.items);
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401)
        await onUnauthorized();
      setError(
        cause instanceof ApiClientError && cause.status === 403
          ? 'マイタスクを表示する権限がありません。'
          : 'マイタスクを読み込めませんでした。',
      );
    } finally {
      setLoading(false);
    }
  }, [api, onUnauthorized, scope, timeZone]);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(
    task: MyTask,
    input: Parameters<ProjectsApi['updateMyTask']>[2],
  ) {
    setUpdatingId(task.id);
    setError('');
    try {
      await api.updateMyTask(task.id, task.rowVersion, input);
      await load();
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401)
        await onUnauthorized();
      setError(
        cause instanceof ApiClientError && cause.status === 409
          ? 'タスクが更新されています。再読込してやり直してください。'
          : 'タスクを更新できませんでした。',
      );
    } finally {
      setUpdatingId(null);
    }
  }

  const counts = useMemo(
    () => ({
      overdue: tasks.filter((task) => task.isOverdue).length,
      today: tasks.filter((task) => task.isDueToday).length,
      upcoming: tasks.filter((task) => task.isUpcoming).length,
    }),
    [tasks],
  );

  return (
    <section className="my-tasks">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Action Center</p>
          <h2>マイタスク</h2>
          <p className="summary">自分に割り当てられた次の対応を確認します。</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          再読込
        </button>
      </div>

      <div className="task-scope-tabs" aria-label="タスク表示範囲">
        {scopes.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={scope === item.value}
            className={scope === item.value ? 'task-scope-active' : ''}
            onClick={() => setScope(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <dl className="task-counts" aria-label="表示中タスクの期限内訳">
        <div>
          <dt>表示件数</dt>
          <dd>{tasks.length}</dd>
        </div>
        <div className={counts.overdue > 0 ? 'task-count-alert' : ''}>
          <dt>期限切れ</dt>
          <dd>{counts.overdue}</dd>
        </div>
        <div>
          <dt>今日</dt>
          <dd>{counts.today}</dd>
        </div>
        <div>
          <dt>今後</dt>
          <dd>{counts.upcoming}</dd>
        </div>
      </dl>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p role="status">マイタスクを読み込んでいます…</p> : null}
      {!loading && tasks.length === 0 ? (
        <p className="empty">該当するタスクはありません。</p>
      ) : null}

      {tasks.length > 0 ? (
        <div className="table-wrap">
          <table className="task-table">
            <thead>
              <tr>
                <th>タスク</th>
                <th>期限</th>
                <th>状態</th>
                <th>優先度</th>
                <th>関連先</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  busy={updatingId === task.id}
                  onNavigate={onNavigate}
                  onUpdate={(input) => void update(task, input)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function TaskRow({
  task,
  busy,
  onNavigate,
  onUpdate,
}: {
  task: MyTask;
  busy: boolean;
  onNavigate: (path: string) => void;
  onUpdate: (input: Parameters<ProjectsApi['updateMyTask']>[2]) => void;
}) {
  const [dueAt, setDueAt] = useState(toLocalDateTime(task.dueAt));

  useEffect(() => {
    setDueAt(toLocalDateTime(task.dueAt));
  }, [task.dueAt]);

  return (
    <tr className={task.isOverdue ? 'task-overdue' : ''}>
      <td className="task-title-cell">
        <strong>{task.title}</strong>
        {task.description ? <span>{task.description}</span> : null}
      </td>
      <td>
        <span className={`task-due task-due-${task.dueCategory}`}>
          {dueLabel(task)}
        </span>
        <input
          aria-label={`${task.title}の期限`}
          type="datetime-local"
          value={dueAt}
          disabled={busy}
          onChange={(event) => setDueAt(event.target.value)}
        />
      </td>
      <td>
        <select
          aria-label={`${task.title}の状態`}
          value={task.status}
          disabled={busy}
          onChange={(event) =>
            onUpdate({ status: event.target.value as TaskStatus })
          }
        >
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </td>
      <td>{priorityLabels[task.priority]}</td>
      <td>
        <TaskLinks task={task} onNavigate={onNavigate} />
      </td>
      <td>
        <div className="task-actions">
          {task.status !== 'completed' ? (
            <button
              className="primary-button"
              type="button"
              aria-label={`「${task.title}」を完了`}
              disabled={busy}
              onClick={() => onUpdate({ status: 'completed' })}
            >
              完了
            </button>
          ) : null}
          <button
            className="secondary-button"
            type="button"
            disabled={busy || dueAt === toLocalDateTime(task.dueAt)}
            onClick={() =>
              onUpdate(
                dueAt
                  ? { dueAt: new Date(dueAt).toISOString() }
                  : { clearDueAt: true },
              )
            }
          >
            期限更新
          </button>
        </div>
      </td>
    </tr>
  );
}

function TaskLinks({
  task,
  onNavigate,
}: {
  task: MyTask;
  onNavigate: (path: string) => void;
}) {
  const links = task.links.filter(
    (link) => link.resourceType !== 'ai_execution',
  );
  if (links.length === 0) return <span>なし</span>;
  return (
    <div className="task-links">
      {links.map((link) => {
        const target = linkedTarget(link.resourceType, link.resourceId);
        const label = linkedLabel(link.resourceType);
        return target ? (
          <button
            key={`${link.resourceType}-${link.resourceId}-${link.linkType}`}
            className="project-link"
            type="button"
            onClick={() => onNavigate(target)}
          >
            {label}
          </button>
        ) : (
          <span
            key={`${link.resourceType}-${link.resourceId}-${link.linkType}`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function linkedTarget(type: string, id: string) {
  const routes: Record<string, string> = {
    project: 'projects',
    company: 'companies',
    contact: 'contacts',
    company_contact: 'contacts',
    engineer: 'engineers',
    proposal: 'proposals',
    interview: 'interviews',
    contract: 'contracts',
    engagement: 'engagements',
    work_log: 'work-logs',
    invoice: 'invoices',
  };
  return routes[type] ? `/${routes[type]}/${encodeURIComponent(id)}` : null;
}

function linkedLabel(type: string) {
  return (
    (
      {
        project: '案件',
        company: '会社',
        contact: '担当者',
        company_contact: '担当者',
        engineer: '技術者',
        proposal: '提案',
        interview: '面談',
        contract: '契約',
        engagement: '参画',
        work_log: '月次実績',
        invoice: '請求',
      } as Record<string, string>
    )[type] ?? type
  );
}

function dueLabel(task: MyTask) {
  if (!task.dueAt) return '期限なし';
  const formatted = new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(task.dueAt));
  if (task.isOverdue) return `期限切れ ${formatted}`;
  if (task.isDueToday) return `今日 ${formatted}`;
  return formatted;
}

function toLocalDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
