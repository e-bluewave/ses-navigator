import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { ApiClientError } from '../api/client.js';
import type {
  SalesActivity,
  SalesActivityApi,
  SalesActivityDirection,
  SalesActivityInput,
  SalesActivityPriority,
  SalesActivityType,
} from '../api/sales-activity-types.js';

const activityTypeLabels: Record<SalesActivityType, string> = {
  call: '電話',
  email: 'メール',
  meeting: '打合せ',
  visit: '訪問',
  proposal: '提案',
  follow_up: 'フォロー',
  other: 'その他',
};

const directionLabels: Record<SalesActivityDirection, string> = {
  outbound: 'こちらから',
  inbound: '先方から',
  internal: '社内',
};

const priorityLabels: Record<SalesActivityPriority, string> = {
  low: '低',
  normal: '通常',
  high: '高',
  urgent: '緊急',
};

const taskStatusLabels = {
  open: '未着手',
  in_progress: '対応中',
  blocked: 'ブロック',
  completed: '完了',
  cancelled: '取消',
} as const;

function initialOccurredAt() {
  return toDateTimeLocal(new Date());
}

export function CompanySalesActivitiesPanel({
  api,
  companyId,
  onUnauthorized,
}: {
  api: SalesActivityApi;
  companyId: string;
  onUnauthorized: () => Promise<void>;
}) {
  const [items, setItems] = useState<SalesActivity[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [activityType, setActivityType] = useState<SalesActivityType>('call');
  const [direction, setDirection] = useState<SalesActivityDirection | ''>(
    'outbound',
  );
  const [occurredAt, setOccurredAt] = useState(initialOccurredAt);
  const [subject, setSubject] = useState('');
  const [summary, setSummary] = useState('');
  const [result, setResult] = useState('');
  const [companyContactId, setCompanyContactId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [engineerId, setEngineerId] = useState('');
  const [createFollowUp, setCreateFollowUp] = useState(false);
  const [followUpTitle, setFollowUpTitle] = useState('');
  const [followUpDescription, setFollowUpDescription] = useState('');
  const [followUpDueAt, setFollowUpDueAt] = useState('');
  const [followUpPriority, setFollowUpPriority] =
    useState<SalesActivityPriority>('normal');

  const handleError = useCallback(
    async (reason: unknown, fallback: string) => {
      if (reason instanceof ApiClientError && reason.status === 401)
        await onUnauthorized();
      else setError(reason instanceof Error ? reason.message : fallback);
    },
    [onUnauthorized],
  );

  const load = useCallback(
    async (cursor?: string, append = false) => {
      try {
        const response = await api.listCompanySalesActivities(companyId, {
          limit: 25,
          ...(cursor ? { cursor } : {}),
        });
        setItems((current) =>
          append ? [...current, ...response.items] : response.items,
        );
        setNextCursor(response.page.nextCursor);
        setError('');
      } catch (reason) {
        await handleError(reason, '営業活動履歴を読み込めませんでした。');
      }
    },
    [api, companyId, handleError],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [load]);

  function resetForm() {
    setActivityType('call');
    setDirection('outbound');
    setOccurredAt(initialOccurredAt());
    setSubject('');
    setSummary('');
    setResult('');
    setCompanyContactId('');
    setProjectId('');
    setEngineerId('');
    setCreateFollowUp(false);
    setFollowUpTitle('');
    setFollowUpDescription('');
    setFollowUpDueAt('');
    setFollowUpPriority('normal');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const input: SalesActivityInput = {
      activityType,
      direction: direction || null,
      occurredAt: new Date(occurredAt).toISOString(),
      subject: subject.trim(),
      summary: summary.trim(),
      result: result.trim() || null,
      companyContactId: companyContactId.trim() || null,
      projectId: projectId.trim() || null,
      engineerId: engineerId.trim() || null,
      followUp: createFollowUp
        ? {
            title: followUpTitle.trim(),
            description: followUpDescription.trim() || null,
            dueAt: new Date(followUpDueAt).toISOString(),
            priority: followUpPriority,
          }
        : null,
    };
    try {
      const created = await api.createCompanySalesActivity(companyId, input);
      setNotice(
        created.followUpTask
          ? '営業活動と次回対応タスクを登録しました。'
          : '営業活動を登録しました。',
      );
      resetForm();
      setShowForm(false);
      await load();
    } catch (reason) {
      await handleError(reason, '営業活動を登録できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="audit-panel" aria-labelledby="sales-activities-heading">
      <div className="section-heading">
        <div>
          <p className="section-kicker">SALES ACTIVITY</p>
          <h3 id="sales-activities-heading">営業活動</h3>
          <p>電話・メール・訪問などの履歴と次回対応を時系列で管理します。</p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => setShowForm((current) => !current)}
        >
          {showForm ? '登録を閉じる' : '営業活動を登録'}
        </button>
      </div>

      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}

      {showForm ? (
        <form className="project-form" onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <label>
              活動種別
              <select
                aria-label="営業活動種別"
                value={activityType}
                onChange={(event) =>
                  setActivityType(event.target.value as SalesActivityType)
                }
              >
                {Object.entries(activityTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              方向
              <select
                aria-label="営業活動方向"
                value={direction}
                onChange={(event) =>
                  setDirection(
                    event.target.value as SalesActivityDirection | '',
                  )
                }
              >
                <option value="">指定なし</option>
                {Object.entries(directionLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              実施日時
              <input
                aria-label="営業活動実施日時"
                type="datetime-local"
                required
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
              />
            </label>
            <label>
              件名
              <input
                aria-label="営業活動件名"
                required
                maxLength={300}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>
            <label>
              会社担当者ID（任意）
              <input
                aria-label="営業活動会社担当者ID"
                value={companyContactId}
                onChange={(event) => setCompanyContactId(event.target.value)}
              />
            </label>
            <label>
              案件ID（任意）
              <input
                aria-label="営業活動案件ID"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              />
            </label>
            <label>
              技術者ID（任意）
              <input
                aria-label="営業活動技術者ID"
                value={engineerId}
                onChange={(event) => setEngineerId(event.target.value)}
              />
            </label>
          </div>
          <label>
            活動内容
            <textarea
              aria-label="営業活動内容"
              required
              maxLength={10000}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <label>
            結果・相手の反応
            <textarea
              aria-label="営業活動結果"
              maxLength={10000}
              value={result}
              onChange={(event) => setResult(event.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={createFollowUp}
              onChange={(event) => setCreateFollowUp(event.target.checked)}
            />
            次回対応タスクを作成
          </label>
          {createFollowUp ? (
            <fieldset>
              <legend>次回対応</legend>
              <div className="form-grid">
                <label>
                  対応内容
                  <input
                    aria-label="次回対応内容"
                    required
                    maxLength={300}
                    value={followUpTitle}
                    onChange={(event) => setFollowUpTitle(event.target.value)}
                  />
                </label>
                <label>
                  期限
                  <input
                    aria-label="次回対応期限"
                    type="datetime-local"
                    required
                    value={followUpDueAt}
                    onChange={(event) => setFollowUpDueAt(event.target.value)}
                  />
                </label>
                <label>
                  優先度
                  <select
                    aria-label="次回対応優先度"
                    value={followUpPriority}
                    onChange={(event) =>
                      setFollowUpPriority(
                        event.target.value as SalesActivityPriority,
                      )
                    }
                  >
                    {Object.entries(priorityLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                詳細
                <textarea
                  aria-label="次回対応詳細"
                  maxLength={10000}
                  value={followUpDescription}
                  onChange={(event) =>
                    setFollowUpDescription(event.target.value)
                  }
                />
              </label>
            </fieldset>
          ) : null}
          <button className="primary-button" disabled={saving}>
            {saving ? '登録中…' : '営業活動を登録'}
          </button>
        </form>
      ) : null}

      {loading ? (
        <p role="status">営業活動履歴を読み込んでいます…</p>
      ) : items.length === 0 ? (
        <p>営業活動履歴はまだありません。</p>
      ) : (
        <ol className="timeline-list">
          {items.map((item) => (
            <li key={item.id}>
              <article>
                <div className="section-heading">
                  <div>
                    <strong>{item.subject}</strong>
                    <p>
                      {formatDateTime(item.occurredAt)} /{' '}
                      {activityTypeLabels[item.activityType]}
                      {item.direction
                        ? ` / ${directionLabels[item.direction]}`
                        : ''}
                    </p>
                  </div>
                </div>
                <p>{item.summary}</p>
                {item.result ? <p>結果: {item.result}</p> : null}
                <p>
                  {item.contact
                    ? `担当者: ${[
                        item.contact.familyName,
                        item.contact.givenName,
                      ]
                        .filter(Boolean)
                        .join(' ')}`
                    : null}
                  {item.project
                    ? `${item.contact ? ' / ' : ''}案件: ${item.project.managementNo} ${item.project.projectName}`
                    : null}
                  {item.engineer
                    ? `${item.contact || item.project ? ' / ' : ''}技術者: ${item.engineer.managementNo} ${item.engineer.displayName}`
                    : null}
                </p>
                {item.followUpTask ? (
                  <div className="audit-panel">
                    <strong>次回対応: {item.followUpTask.title}</strong>
                    <p>
                      {taskStatusLabels[item.followUpTask.status]} / 優先度{' '}
                      {priorityLabels[item.followUpTask.priority]} / 期限{' '}
                      {item.followUpTask.dueAt
                        ? formatDateTime(item.followUpTask.dueAt)
                        : '未設定'}
                    </p>
                    <a className="project-link" href="/my-tasks">
                      マイタスクで確認
                    </a>
                  </div>
                ) : null}
              </article>
            </li>
          ))}
        </ol>
      )}

      {nextCursor ? (
        <button
          type="button"
          className="secondary-button"
          disabled={loadingMore}
          onClick={() => {
            setLoadingMore(true);
            void load(nextCursor, true).finally(() => setLoadingMore(false));
          }}
        >
          {loadingMore ? '読み込み中…' : 'さらに表示'}
        </button>
      ) : null}
    </section>
  );
}

function toDateTimeLocal(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
