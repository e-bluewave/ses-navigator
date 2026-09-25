import { useCallback, useEffect, useState } from 'react';

import { ApiClientError } from '../api/client.js';
import type {
  DuplicateCandidate,
  DuplicateCandidateApi,
  DuplicateDecisionFilter,
  DuplicateEntityFilter,
  DuplicateEntityType,
  DuplicateReviewDecision,
} from '../api/duplicate-candidate-types.js';

interface DuplicateCandidatesViewProps {
  api: DuplicateCandidateApi;
  onNavigate: (path: string) => void;
  onUnauthorized: () => Promise<void>;
}

const entityOptions: Array<{
  value: DuplicateEntityFilter;
  label: string;
}> = [
  { value: 'all', label: 'すべて' },
  { value: 'company', label: '会社' },
  { value: 'engineer', label: '技術者' },
  { value: 'project', label: '案件' },
];

const decisionOptions: Array<{
  value: DuplicateDecisionFilter;
  label: string;
}> = [
  { value: 'pending', label: '未確認' },
  { value: 'hold', label: '保留' },
  { value: 'duplicate', label: '重複' },
  { value: 'not_duplicate', label: '重複ではない' },
  { value: 'merged', label: '統合済み' },
  { value: 'all', label: 'すべて' },
];

const entityLabels: Record<DuplicateEntityType, string> = {
  company: '会社',
  engineer: '技術者',
  project: '案件',
};

const decisionLabels = {
  pending: '未確認',
  duplicate: '重複',
  not_duplicate: '重複ではない',
  hold: '保留',
  merged: '統合済み',
} as const;

export function DuplicateCandidatesView({
  api,
  onNavigate,
  onUnauthorized,
}: DuplicateCandidatesViewProps) {
  const [entityType, setEntityType] = useState<DuplicateEntityFilter>('all');
  const [decision, setDecision] =
    useState<DuplicateDecisionFilter>('pending');
  const [items, setItems] = useState<DuplicateCandidate[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      append ? setLoadingMore(true) : setLoading(true);
      setError('');
      try {
        const result = await api.listDuplicateCandidates({
          entityType,
          decision,
          limit: 50,
          ...(cursor ? { cursor } : {}),
        });
        setItems((current) =>
          append ? [...current, ...result.items] : result.items,
        );
        setNextCursor(result.page.nextCursor);
      } catch (cause) {
        if (cause instanceof ApiClientError && cause.status === 401)
          await onUnauthorized();
        setError(
          cause instanceof ApiClientError && cause.status === 403
            ? '重複候補を表示する権限がありません。'
            : '重複候補を読み込めませんでした。',
        );
      } finally {
        append ? setLoadingMore(false) : setLoading(false);
      }
    },
    [api, decision, entityType, onUnauthorized],
  );

  useEffect(() => {
    void fetchPage(null, false);
  }, [fetchPage]);

  async function reviewed() {
    await fetchPage(null, false);
  }

  return (
    <section className="content-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Duplicate Review</p>
          <h2>重複候補</h2>
          <p>
            会社・技術者・案件の候補を人が確認します。この画面では実データの統合は行いません。
          </p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void fetchPage(null, false)}
        >
          再読込
        </button>
      </div>

      <div className="filter-row">
        <label>
          種別
          <select
            value={entityType}
            onChange={(event) =>
              setEntityType(event.target.value as DuplicateEntityFilter)
            }
          >
            {entityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          判断
          <select
            value={decision}
            onChange={(event) =>
              setDecision(event.target.value as DuplicateDecisionFilter)
            }
          >
            {decisionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p role="status">重複候補を読み込んでいます…</p> : null}
      {!loading && items.length === 0 ? (
        <p className="empty">該当する重複候補はありません。</p>
      ) : null}

      <div className="match-candidate-list">
        {items.map((candidate) => (
          <DuplicateCandidateCard
            key={`${candidate.entityType}-${candidate.id}`}
            candidate={candidate}
            api={api}
            onNavigate={onNavigate}
            onUnauthorized={onUnauthorized}
            onReviewed={reviewed}
          />
        ))}
      </div>

      {nextCursor ? (
        <button
          className="secondary-button"
          type="button"
          disabled={loadingMore}
          onClick={() => void fetchPage(nextCursor, true)}
        >
          {loadingMore ? '読込中…' : '次の候補を読み込む'}
        </button>
      ) : null}
    </section>
  );
}

function DuplicateCandidateCard({
  candidate,
  api,
  onNavigate,
  onUnauthorized,
  onReviewed,
}: {
  candidate: DuplicateCandidate;
  api: DuplicateCandidateApi;
  onNavigate: (path: string) => void;
  onUnauthorized: () => Promise<void>;
  onReviewed: () => Promise<void>;
}) {
  const [reviewDecision, setReviewDecision] =
    useState<DuplicateReviewDecision | ''>('');
  const [note, setNote] = useState(candidate.reviewNote ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!reviewDecision) return;
    setSaving(true);
    setError('');
    try {
      await api.reviewDuplicateCandidate(candidate.entityType, candidate.id, {
        decision: reviewDecision,
        note: note.trim() || null,
      });
      await onReviewed();
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401)
        await onUnauthorized();
      setError(
        cause instanceof ApiClientError && cause.status === 403
          ? 'この候補を更新する権限がありません。'
          : '判断を保存できませんでした。',
      );
    } finally {
      setSaving(false);
    }
  }

  const canReview = candidate.decision !== 'merged';

  return (
    <article className="audit-panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">{entityLabels[candidate.entityType]}</p>
          <h3>一致度 {Math.round(candidate.score * 100)}%</h3>
        </div>
        <strong>{decisionLabels[candidate.decision]}</strong>
      </div>

      <div className="detail-grid">
        <DuplicateRecord
          label="比較元"
          entityType={candidate.entityType}
          record={candidate.leftRecord}
          onNavigate={onNavigate}
        />
        <DuplicateRecord
          label="候補"
          entityType={candidate.entityType}
          record={candidate.rightRecord}
          onNavigate={onNavigate}
        />
      </div>

      <h4>一致理由</h4>
      {candidate.matchReasons.length > 0 ? (
        <ul>
          {candidate.matchReasons.map((reason, index) => (
            <li key={index}>{reasonText(reason)}</li>
          ))}
        </ul>
      ) : (
        <p>一致理由は登録されていません。</p>
      )}

      {candidate.reviewedAt ? (
        <p>
          前回確認: {new Intl.DateTimeFormat('ja-JP', {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(candidate.reviewedAt))}
        </p>
      ) : null}
      {candidate.reviewNote ? <p>確認メモ: {candidate.reviewNote}</p> : null}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {canReview ? (
        <div className="project-form">
          <label>
            判断
            <select
              value={reviewDecision}
              disabled={saving}
              onChange={(event) =>
                setReviewDecision(
                  event.target.value as DuplicateReviewDecision | '',
                )
              }
            >
              <option value="">選択してください</option>
              <option value="duplicate">重複</option>
              <option value="not_duplicate">重複ではない</option>
              <option value="hold">保留</option>
            </select>
          </label>
          <label>
            確認メモ
            <textarea
              maxLength={2000}
              value={note}
              disabled={saving}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={saving || reviewDecision === ''}
            onClick={() => void save()}
          >
            {saving ? '保存中…' : '判断を保存'}
          </button>
        </div>
      ) : (
        <p>統合済み候補はこの画面から変更できません。</p>
      )}
    </article>
  );
}

function DuplicateRecord({
  label,
  entityType,
  record,
  onNavigate,
}: {
  label: string;
  entityType: DuplicateEntityType;
  record: DuplicateCandidate['leftRecord'];
  onNavigate: (path: string) => void;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <button
          className="project-link"
          type="button"
          onClick={() => onNavigate(entityTarget(entityType, record.id))}
        >
          {record.managementNo} {record.name}
        </button>
        <small>
          {record.status}
          {record.secondary ? ` / ${record.secondary}` : ''}
        </small>
      </dd>
    </div>
  );
}

function entityTarget(entityType: DuplicateEntityType, id: string) {
  const base = {
    company: 'companies',
    engineer: 'engineers',
    project: 'projects',
  }[entityType];
  return `/${base}/${encodeURIComponent(id)}`;
}

function reasonText(reason: unknown) {
  if (typeof reason === 'string') return reason;
  if (reason && typeof reason === 'object' && !Array.isArray(reason)) {
    return Object.entries(reason as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(' / ');
  }
  return JSON.stringify(reason);
}
