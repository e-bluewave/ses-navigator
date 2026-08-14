import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ProjectsApi } from '../api/client.js';
import { ApiClientError } from '../api/client.js';
import type {
  ProfitabilityDashboard,
  SalesKpiDashboard,
} from '../api/generated.js';

interface HomeDashboardViewProps {
  api: ProjectsApi;
  onNavigate: (path: string) => void;
  onUnauthorized: () => Promise<void>;
}

export function HomeDashboardView({
  api,
  onNavigate,
  onUnauthorized,
}: HomeDashboardViewProps) {
  const range = useMemo(() => dashboardRange(new Date()), []);
  const [sales, setSales] = useState<SalesKpiDashboard | null>(null);
  const [finance, setFinance] = useState<ProfitabilityDashboard | null>(null);
  const [salesError, setSalesError] = useState('');
  const [financeError, setFinanceError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setSalesError('');
    setFinanceError('');
    const [salesResult, financeResult] = await Promise.allSettled([
      api.getSalesKpiDashboard({
        fromDate: range.fromDate,
        toDate: range.toDate,
        contractExpiryDays: 60,
      }),
      api.getProfitabilityDashboard({
        fromMonth: range.fromMonth,
        toMonth: range.toMonth,
        currency: 'JPY',
      }),
    ]);
    let unauthorized = false;
    if (salesResult.status === 'fulfilled') setSales(salesResult.value);
    else {
      setSales(null);
      unauthorized ||= isUnauthorized(salesResult.reason);
      setSalesError(errorMessage(salesResult.reason, '営業KPI'));
    }
    if (financeResult.status === 'fulfilled') setFinance(financeResult.value);
    else {
      setFinance(null);
      unauthorized ||= isUnauthorized(financeResult.reason);
      setFinanceError(errorMessage(financeResult.reason, '収支情報'));
    }
    setLoading(false);
    if (unauthorized) await onUnauthorized();
  }, [api, onUnauthorized, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const monthly = useMemo(() => mergeMonthly(sales, finance), [finance, sales]);

  return (
    <section className="home-dashboard">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>ホームダッシュボード</h2>
          <p className="summary">
            営業の進捗、承認待ち、契約期限、収支をひとつの画面で確認します。
          </p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          再読込
        </button>
      </div>

      {loading ? <p role="status">ダッシュボードを集計しています…</p> : null}
      <div className="dashboard-actions" aria-label="クイック操作">
        <button onClick={() => onNavigate('/proposals')}>提案を確認</button>
        <button onClick={() => onNavigate('/interviews')}>面談を確認</button>
        <button onClick={() => onNavigate('/contracts')}>契約を確認</button>
        <button onClick={() => onNavigate('/invoices')}>請求を確認</button>
      </div>

      <section className="dashboard-section" aria-labelledby="sales-overview">
        <div className="dashboard-section-heading">
          <h3 id="sales-overview">営業・対応状況</h3>
          <button onClick={() => onNavigate('/sales-kpi')}>詳細を見る</button>
        </div>
        {salesError ? <p className="dashboard-notice">{salesError}</p> : null}
        {sales ? (
          <dl className="dashboard-card-grid">
            <Metric label="提案件数" value={sales.proposalCount} />
            <Metric label="面談化率" value={percent(sales.interviewRate)} />
            <Metric label="成約率" value={percent(sales.winRate)} />
            <Metric label="進行中提案" value={sales.activeProposalCount} />
            <Metric label="承認待ち" value={sales.pendingApprovalCount} alert />
            <Metric label="予定面談" value={sales.scheduledInterviewCount} />
            <Metric
              label="期限接近契約"
              value={sales.expiringContractCount}
              alert
            />
          </dl>
        ) : null}
      </section>

      <section className="dashboard-section" aria-labelledby="finance-overview">
        <div className="dashboard-section-heading">
          <h3 id="finance-overview">収支・回収状況</h3>
          <button onClick={() => onNavigate('/profitability')}>
            詳細を見る
          </button>
        </div>
        {financeError ? (
          <p className="dashboard-notice">{financeError}</p>
        ) : null}
        {finance ? (
          <dl className="dashboard-card-grid">
            <Metric
              label="売上"
              value={money(finance.revenue, finance.currency)}
            />
            <Metric
              label="粗利"
              value={money(finance.grossProfit, finance.currency)}
            />
            <Metric label="粗利率" value={percent(finance.grossMarginRate)} />
            <Metric
              label="売掛残高"
              value={money(finance.receivableBalance, finance.currency)}
              alert={finance.receivableBalance > 0}
            />
          </dl>
        ) : null}
      </section>

      {monthly.length > 0 ? (
        <section
          className="dashboard-section"
          aria-labelledby="monthly-overview"
        >
          <h3 id="monthly-overview">月次推移</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>対象月</th>
                  <th>提案</th>
                  <th>面談化率</th>
                  <th>成約率</th>
                  <th>売上</th>
                  <th>粗利</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((row) => (
                  <tr key={row.periodMonth}>
                    <td>{row.periodMonth.slice(0, 7)}</td>
                    <td>{row.proposalCount ?? '—'}</td>
                    <td>{percent(row.interviewRate)}</td>
                    <td>{percent(row.winRate)}</td>
                    <td>
                      {row.revenue === null
                        ? '—'
                        : money(row.revenue, finance?.currency ?? 'JPY')}
                    </td>
                    <td>
                      {row.grossProfit === null
                        ? '—'
                        : money(row.grossProfit, finance?.currency ?? 'JPY')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {sales?.expiringContracts.length ? (
        <section
          className="dashboard-section"
          aria-labelledby="expiry-overview"
        >
          <div className="dashboard-section-heading">
            <h3 id="expiry-overview">契約期限アラート</h3>
            <button onClick={() => onNavigate('/contracts')}>契約一覧へ</button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>契約番号</th>
                  <th>契約名</th>
                  <th>終了日</th>
                  <th>残日数</th>
                </tr>
              </thead>
              <tbody>
                {sales.expiringContracts.map((contract) => (
                  <tr key={contract.id}>
                    <td>{contract.contractNo}</td>
                    <td>{contract.title}</td>
                    <td>{contract.endDate}</td>
                    <td>{contract.daysRemaining}日</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div
      className={
        alert ? 'dashboard-metric dashboard-metric-alert' : 'dashboard-metric'
      }
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function dashboardRange(now: Date) {
  const toDate = now.toISOString().slice(0, 10);
  const toMonth = `${toDate.slice(0, 7)}-01`;
  const fromMonth = `${toDate.slice(0, 4)}-01-01`;
  return { fromDate: fromMonth, toDate, fromMonth, toMonth };
}

function percent(value: number | null) {
  return value === null ? '—' : `${value}%`;
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function isUnauthorized(cause: unknown) {
  return cause instanceof ApiClientError && cause.status === 401;
}

function errorMessage(cause: unknown, subject: string) {
  if (cause instanceof ApiClientError && cause.status === 403)
    return `${subject}を表示する権限がありません。`;
  return `${subject}を読み込めませんでした。`;
}

function mergeMonthly(
  sales: SalesKpiDashboard | null,
  finance: ProfitabilityDashboard | null,
) {
  const rows = new Map<
    string,
    {
      periodMonth: string;
      proposalCount: number | null;
      interviewRate: number | null;
      winRate: number | null;
      revenue: number | null;
      grossProfit: number | null;
    }
  >();
  for (const row of sales?.monthly ?? [])
    rows.set(row.periodMonth, {
      periodMonth: row.periodMonth,
      proposalCount: row.proposalCount,
      interviewRate: row.interviewRate,
      winRate: row.winRate,
      revenue: null,
      grossProfit: null,
    });
  for (const row of finance?.monthly ?? []) {
    const current = rows.get(row.periodMonth);
    rows.set(row.periodMonth, {
      periodMonth: row.periodMonth,
      proposalCount: current?.proposalCount ?? null,
      interviewRate: current?.interviewRate ?? null,
      winRate: current?.winRate ?? null,
      revenue: row.revenue,
      grossProfit: row.grossProfit,
    });
  }
  return [...rows.values()].sort((a, b) =>
    a.periodMonth.localeCompare(b.periodMonth),
  );
}
