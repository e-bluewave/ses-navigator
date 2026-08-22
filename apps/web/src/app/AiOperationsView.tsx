import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { ApiClientError } from '../api/client.js';
import type { ProjectsApi } from '../api/client.js';
import type {
  AiBudgetPolicy,
  AiBudgetPolicyInput,
  AiOperationsDashboard,
} from '../api/generated.js';

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
  const [budget, setBudget] = useState<AiBudgetPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [budgetError, setBudgetError] = useState('');
  const [budgetSaving, setBudgetSaving] = useState(false);

  const load = useCallback(
    async (from: string, to: string) => {
      setLoading(true);
      setError('');
      try {
        const [loadedDashboard, loadedBudget] = await Promise.all([
          api.getAiOperationsDashboard({ fromDate: from, toDate: to }),
          api.getAiBudgetPolicy(),
        ]);
        setDashboard(loadedDashboard);
        setBudget(loadedBudget);
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

  async function saveBudget(input: AiBudgetPolicyInput) {
    if (!budget) return;
    setBudgetSaving(true);
    setBudgetError('');
    try {
      setBudget(await api.saveAiBudgetPolicy(budget.rowVersion, input));
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401) {
        await onUnauthorized();
        return;
      }
      setBudgetError(
        cause instanceof ApiClientError
          ? cause.message
          : 'AI予算設定を保存できませんでした。',
      );
    } finally {
      setBudgetSaving(false);
    }
  }

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
      {budget ? (
        <BudgetPanel
          key={budget.rowVersion}
          budget={budget}
          saving={budgetSaving}
          error={budgetError}
          onSave={saveBudget}
        />
      ) : null}
      {dashboard ? <Dashboard dashboard={dashboard} /> : null}
    </section>
  );
}

function BudgetPanel({
  budget,
  saving,
  error,
  onSave,
}: {
  budget: AiBudgetPolicy;
  saving: boolean;
  error: string;
  onSave: (input: AiBudgetPolicyInput) => Promise<void>;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void onSave({
      enabled: form.get('enabled') === 'on',
      currency: formString(form, 'currency').trim().toUpperCase(),
      dailyWarningAmount: optionalNumber(form, 'dailyWarningAmount'),
      dailyStopAmount: optionalNumber(form, 'dailyStopAmount'),
      monthlyWarningAmount: optionalNumber(form, 'monthlyWarningAmount'),
      monthlyStopAmount: optionalNumber(form, 'monthlyStopAmount'),
      dailyWarningExecutions: optionalInteger(form, 'dailyWarningExecutions'),
      dailyStopExecutions: optionalInteger(form, 'dailyStopExecutions'),
      monthlyWarningExecutions: optionalInteger(
        form,
        'monthlyWarningExecutions',
      ),
      monthlyStopExecutions: optionalInteger(form, 'monthlyStopExecutions'),
    });
  }

  return (
    <section className="dashboard-section" aria-labelledby="ai-budget-summary">
      <h3 id="ai-budget-summary">AI予算・実行上限（UTC基準）</h3>
      <p role="status">
        {budget.stopReached
          ? '停止閾値に到達しているため、新しいAI実行を停止しています。'
          : budget.warningReached
            ? '警告閾値に到達しています。利用状況を確認してください。'
            : budget.enabled
              ? '予算制御は有効です。'
              : '予算制御は無効です。設定を保存して有効化するまでAI実行を停止しません。'}
      </p>
      <dl className="dashboard-card-grid">
        <Metric label="本日の実行" value={number(budget.dailyExecutionCount)} />
        <Metric
          label="今月の実行"
          value={number(budget.monthlyExecutionCount)}
        />
        <Metric
          label="本日の概算"
          value={cost(budget.dailyEstimatedCost, budget.currency)}
          alert={budget.warningReached}
        />
        <Metric
          label="今月の概算"
          value={cost(budget.monthlyEstimatedCost, budget.currency)}
          alert={budget.warningReached}
        />
      </dl>
      {budget.canManage ? (
        <form className="project-form budget-form" onSubmit={submit}>
          <label className="budget-toggle">
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={budget.enabled}
            />
            予算制御を有効にする
          </label>
          <label>
            通貨
            <input
              name="currency"
              defaultValue={budget.currency}
              maxLength={3}
              pattern="[A-Za-z]{3}"
              required
            />
          </label>
          <div className="budget-limit-grid">
            <BudgetField
              name="dailyWarningAmount"
              label="日次警告額"
              value={budget.dailyWarningAmount}
            />
            <BudgetField
              name="dailyStopAmount"
              label="日次停止額"
              value={budget.dailyStopAmount}
            />
            <BudgetField
              name="monthlyWarningAmount"
              label="月次警告額"
              value={budget.monthlyWarningAmount}
            />
            <BudgetField
              name="monthlyStopAmount"
              label="月次停止額"
              value={budget.monthlyStopAmount}
            />
            <BudgetField
              name="dailyWarningExecutions"
              label="日次警告件数"
              value={budget.dailyWarningExecutions}
              integer
            />
            <BudgetField
              name="dailyStopExecutions"
              label="日次停止件数"
              value={budget.dailyStopExecutions}
              integer
            />
            <BudgetField
              name="monthlyWarningExecutions"
              label="月次警告件数"
              value={budget.monthlyWarningExecutions}
              integer
            />
            <BudgetField
              name="monthlyStopExecutions"
              label="月次停止件数"
              value={budget.monthlyStopExecutions}
              integer
            />
          </div>
          <p>
            空欄の項目は判定に使用しません。有効化する場合は停止額または停止件数を1つ以上設定してください。
          </p>
          {error ? <p role="alert">{error}</p> : null}
          <button className="primary-button" disabled={saving}>
            {saving ? '保存中…' : '予算設定を保存'}
          </button>
        </form>
      ) : (
        <p>設定変更にはtenant.manage権限が必要です。</p>
      )}
    </section>
  );
}

function BudgetField({
  name,
  label,
  value,
  integer = false,
}: {
  name: string;
  label: string;
  value: number | null;
  integer?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type="number"
        min={integer ? 1 : 0}
        step={integer ? 1 : '0.000001'}
        defaultValue={value ?? ''}
      />
    </label>
  );
}

function optionalNumber(form: FormData, name: string) {
  const value = formString(form, name).trim();
  return value === '' ? null : Number(value);
}

function optionalInteger(form: FormData, name: string) {
  return optionalNumber(form, name);
}

function formString(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
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
