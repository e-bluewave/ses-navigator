import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { ApiClientError } from '../api/client.js';
import type { ProjectsApi } from '../api/client.js';
import type { AiOperationsDashboard } from '../api/generated.js';

interface AiOperationsViewProps {
  api: ProjectsApi;
  onUnauthorized: () => Promise<void>;
}

export function AiOperationsView({
  api,
  onUnauthorized,
}: AiOperationsViewProps) {
  const initialRange = useMemo(() => defaultRange(new Date()), []);
  const [fromDate, setFromDate] = useState(initialRange.fromDate);
  const [toDate, setToDate] = useState(initialRange.toDate);
  const [dashboard, setDashboard] = useState<AiOperationsDashboard | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    async (from: string, to: string) => {
      setLoading(true);
      setError('');
      try {
        setDashboard(
          await api.getAiOperationsDashboard({ fromDate: from, toDate: to }),
        );
      } catch (cause) {
        setDashboard(null);
        if (cause instanceof ApiClientError && cause.status === 401) {
          await onUnauthorized();
          return;
        }
        setError(
          cause instanceof ApiClientError
            ? cause.message
            : 'AI運用状況を読み込めませんでした。',
        );
      } finally {
        setLoading(false);
      }
    },
    [api, onUnauthorized],
  );

  useEffect(() => {
    void load(initialRange.fromDate, initialRange.toDate);
  }, [initialRange, load]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void load(fromDate, toDate);
  }

  return (
    <section className="content-panel" aria-labelledby="ai-operations-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AI Operations</p>
          <h2 id="ai-operations-heading">AI品質・費用・利用状況</h2>
          <p>
            AI本文を表示せず、テナント内の実行・レビュー・費用記録率・障害傾向を確認します。
          </p>
        </div>
      </div>

      <form className="filter-row" onSubmit={submit}>
        <label>
          開始日
          <input
            aria-label="AI集計開始日"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            required
          />
        </label>
        <label>
          終了日
          <input
            aria-label="AI集計終了日"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            required
          />
        </label>
        <button className="primary-button">集計</button>
      </form>

      {loading ? <p role="status">AI運用状況を集計しています…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {dashboard ? <Dashboard dashboard={dashboard} /> : null}
    </section>
  );
}

function Dashboard({ dashboard }: { dashboard: AiOperationsDashboard }) {
  return (
    <>
      <section className="dashboard-section" aria-labelledby="ai-usage-summary">
        <h3 id="ai-usage-summary">利用・安定性</h3>
        <dl className="dashboard-card-grid">
          <Metric label="実行数" value={number(dashboard.executionCount)} />
          <Metric label="成功率" value={percent(dashboard.successRate)} />
          <Metric label="失敗" value={number(dashboard.failedCount)} alert />
          <Metric
            label="レビュー待ち"
            value={number(dashboard.reviewRequiredCount)}
            alert
          />
          <Metric label="総トークン" value={number(dashboard.totalTokens)} />
          <Metric
            label="平均処理時間"
            value={duration(dashboard.averageLatencyMs)}
          />
          <Metric
            label="P95処理時間"
            value={duration(dashboard.p95LatencyMs)}
          />
          <Metric
            label="費用記録率"
            value={percent(dashboard.costCoverageRate)}
            alert={
              dashboard.executionCount > 0 &&
              (dashboard.costCoverageRate ?? 0) < 100
            }
          />
        </dl>
      </section>

      <section
        className="dashboard-section"
        aria-labelledby="ai-quality-summary"
      >
        <h3 id="ai-quality-summary">人による品質確認</h3>
        <dl className="dashboard-card-grid">
          <Metric
            label="レビュー済み"
            value={number(dashboard.reviewedCount)}
          />
          <Metric label="承認率" value={percent(dashboard.approvalRate)} />
          <Metric
            label="修正承認"
            value={number(dashboard.partiallyApprovedCount)}
          />
          <Metric label="却下" value={number(dashboard.rejectedCount)} alert />
          <Metric label="評価件数" value={number(dashboard.feedbackCount)} />
          <Metric label="平均評価" value={rating(dashboard.averageRating)} />
          <Metric
            label="問題報告"
            value={number(dashboard.issueFeedbackCount)}
            alert
          />
          <Metric
            label="安全性報告"
            value={number(dashboard.unsafeFeedbackCount)}
            alert
          />
        </dl>
      </section>

      <section className="dashboard-section" aria-labelledby="ai-cost-summary">
        <h3 id="ai-cost-summary">通貨別概算費用</h3>
        {dashboard.costByCurrency.length === 0 ? (
          <p>概算費用はまだ記録されていません。</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>通貨</th>
                  <th>概算費用</th>
                  <th>記録済み実行</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.costByCurrency.map((item) => (
                  <tr key={item.currency}>
                    <td>{item.currency}</td>
                    <td>{cost(item.estimatedCost, item.currency)}</td>
                    <td>{number(item.recordedCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-section" aria-labelledby="ai-daily-usage">
        <h3 id="ai-daily-usage">日別利用推移</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>日付</th>
                <th>実行</th>
                <th>成功</th>
                <th>失敗</th>
                <th>トークン</th>
                <th>USD概算</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.daily.map((item) => (
                <tr key={item.usageDate}>
                  <td>{item.usageDate}</td>
                  <td>{number(item.executionCount)}</td>
                  <td>{number(item.succeededCount)}</td>
                  <td>{number(item.failedCount)}</td>
                  <td>{number(item.totalTokens)}</td>
                  <td>{cost(item.estimatedCostUsd, 'USD')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="ai-type-usage">
        <h3 id="ai-type-usage">用途別利用状況</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>用途</th>
                <th>実行</th>
                <th>成功率</th>
                <th>失敗</th>
                <th>トークン</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.typeUsage.map((item) => (
                <tr key={item.executionType}>
                  <td>{item.executionType}</td>
                  <td>{number(item.executionCount)}</td>
                  <td>{percent(item.successRate)}</td>
                  <td>{number(item.failedCount)}</td>
                  <td>{number(item.totalTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="ai-model-usage">
        <h3 id="ai-model-usage">モデル別利用・費用</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Provider / Model</th>
                <th>実行</th>
                <th>失敗</th>
                <th>入力</th>
                <th>出力</th>
                <th>概算費用</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.modelUsage.map((item) => (
                <tr key={`${item.provider}:${item.modelName}:${item.currency}`}>
                  <td>
                    {item.provider} / {item.modelName}
                  </td>
                  <td>{number(item.executionCount)}</td>
                  <td>{number(item.failedCount)}</td>
                  <td>{number(item.inputTokens)}</td>
                  <td>{number(item.outputTokens)}</td>
                  <td>{cost(item.estimatedCost, item.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {dashboard.recentFailures.length > 0 ? (
        <section className="dashboard-section" aria-labelledby="ai-failures">
          <h3 id="ai-failures">直近の失敗（最大20件）</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>発生日時</th>
                  <th>用途</th>
                  <th>モデル</th>
                  <th>エラーコード</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentFailures.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {new Date(item.requestedAt).toLocaleString('ja-JP')}
                    </td>
                    <td>{item.executionType}</td>
                    <td>{item.modelName}</td>
                    <td>{item.errorCode ?? '未分類'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

function Metric({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div
      className={
        alert ? 'dashboard-card dashboard-card-alert' : 'dashboard-card'
      }
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function defaultRange(now: Date) {
  const to = new Date(now);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 29);
  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
  };
}

function number(value: number) {
  return new Intl.NumberFormat('ja-JP').format(value);
}

function percent(value: number | null) {
  return value === null ? '—' : `${value.toFixed(2)}%`;
}

function rating(value: number | null) {
  return value === null ? '—' : `${value.toFixed(2)} / 5`;
}

function duration(value: number | null) {
  return value === null ? '—' : `${(value / 1000).toFixed(2)}秒`;
}

function cost(value: number, currency: string) {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}
