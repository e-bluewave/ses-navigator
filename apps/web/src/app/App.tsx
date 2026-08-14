import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { ApiClientError, createProjectsApi } from '../api/client.js';
import type { ProjectsApi } from '../api/client.js';
import type {
  Company,
  CompanyStatus,
  CompanyInput,
  CompanyContact,
  CompanyContactInput,
  ContactStatus,
  Project,
  ProjectStatus,
  RecruitmentStatus,
  ProjectInput,
  Engineer,
  EngineerInput,
  EngineerStatus,
  AvailabilityStatus,
  EngineerPrivateDetail,
  EngineerPrivateInput,
  EngineerAffiliation,
  EngineerAffiliationInput,
  EngineerPreference,
  EngineerPreferenceInput,
  EngineerSkill,
  EngineerSkillInput,
  EngineerQualification,
  EngineerQualificationInput,
  EngineerCareerHistory,
  EngineerResume,
  Proposal,
  ProposalInput,
  ProposalStatus,
  ProposalWinResult,
  Interview,
  InterviewInput,
  InterviewResultInput,
  InterviewParticipantInput,
  InterviewStatus,
  InterviewType,
  Contract,
  ContractInput,
  ContractPartyInput,
  ContractSummary,
  ContractStatus,
  ContractType,
  Engagement,
  EngagementInput,
  EngagementSummary,
  EngagementStatus,
  WorkLog,
  WorkLogInput,
  WorkLogSummary,
  WorkLogStatus,
  WorkType,
  Invoice,
  InvoiceSummary,
  InvoiceStatus,
  InvoiceType,
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

const proposalStatusLabels: Record<ProposalStatus, string> = {
  draft: '下書き',
  pending_approval: '承認待ち',
  approved: '承認済み',
  sent: '送付済み',
  interview_requested: '面談依頼',
  interviewing: '面談中',
  offered: 'オファー',
  won: '成約',
  lost: '失注',
  withdrawn: '辞退',
  cancelled: '中止',
};

const proposalTransitions: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['draft', 'approved', 'cancelled'],
  approved: ['draft', 'sent', 'cancelled'],
  sent: ['interview_requested', 'lost', 'withdrawn', 'cancelled'],
  interview_requested: ['interviewing', 'lost', 'withdrawn', 'cancelled'],
  interviewing: ['offered', 'lost', 'withdrawn', 'cancelled'],
  offered: ['won', 'lost', 'withdrawn', 'cancelled'],
  won: [],
  lost: [],
  withdrawn: [],
  cancelled: [],
};

const interviewStatusLabels: Record<InterviewStatus, string> = {
  tentative: '日程調整中',
  scheduled: '予定確定',
  completed: '実施済み',
  cancelled: 'キャンセル',
  no_show: '不参加',
};

const interviewTypeLabels = {
  online: 'オンライン',
  onsite: '対面',
  phone: '電話',
  other: 'その他',
} as const;

const contractStatusLabels: Record<ContractStatus, string> = {
  draft: '下書き',
  review: '確認中',
  active: '契約中',
  suspended: '停止中',
  expired: '期間満了',
  terminated: '終了',
  cancelled: '取消',
};

const contractTypeLabels: Record<ContractType, string> = {
  ses: 'SES',
  dispatch: '派遣',
  subcontract: '請負',
  quasi_mandate: '準委任',
  fixed_price: '一括請負',
  other: 'その他',
};

const engagementStatusLabels: Record<EngagementStatus, string> = {
  draft: '下書き',
  preparing: '参画準備中',
  active: '参画中',
  ending: '終了手続中',
  ended: '終了',
  cancelled: '取消',
};

const workLogStatusLabels: Record<WorkLogStatus, string> = {
  draft: '下書き',
  submitted: '提出済み',
  approved: '承認済み',
  rejected: '差戻し',
  locked: '締め済み',
};

const workTypeLabels: Record<WorkType, string> = {
  work: '勤務',
  paid_leave: '有給休暇',
  absence: '欠勤',
  holiday: '休日',
  training: '研修',
  other: 'その他',
};

const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  draft: '下書き',
  issued: '発行済み',
  sent: '送付済み',
  partially_paid: '一部入金',
  paid: '入金済み',
  overdue: '支払期限超過',
  cancelled: '取消',
  void: '無効',
};
const invoiceTypeLabels: Record<InvoiceType, string> = {
  sales: '売上請求',
  purchase: '仕入請求',
};

type Route =
  | { page: 'invoices' }
  | { page: 'invoice-detail'; id: string }
  | { page: 'work-logs' }
  | { page: 'work-log-detail'; id: string }
  | { page: 'work-log-new' }
  | { page: 'work-log-edit'; id: string }
  | { page: 'engagements' }
  | { page: 'engagement-detail'; id: string }
  | { page: 'engagement-new' }
  | { page: 'engagement-edit'; id: string }
  | { page: 'contracts' }
  | { page: 'contract-detail'; id: string }
  | { page: 'contract-new' }
  | { page: 'contract-edit'; id: string }
  | { page: 'interviews' }
  | { page: 'interview-detail'; id: string }
  | { page: 'interview-new' }
  | { page: 'interview-edit'; id: string }
  | { page: 'interview-result'; id: string }
  | { page: 'proposals' }
  | { page: 'proposal-detail'; id: string }
  | { page: 'proposal-new' }
  | { page: 'proposal-edit'; id: string }
  | { page: 'list' }
  | { page: 'detail'; id: string }
  | { page: 'new' }
  | { page: 'edit'; id: string }
  | { page: 'companies' }
  | { page: 'company-detail'; id: string }
  | { page: 'company-new' }
  | { page: 'company-edit'; id: string }
  | { page: 'contacts' }
  | { page: 'contact-detail'; id: string }
  | { page: 'engineers' }
  | { page: 'engineer-detail'; id: string }
  | { page: 'engineer-new' }
  | { page: 'engineer-edit'; id: string };

function currentRoute(): Route {
  if (window.location.pathname === '/invoices') return { page: 'invoices' };
  const invoice = window.location.pathname.match(/^\/invoices\/([^/]+)$/);
  if (invoice)
    return { page: 'invoice-detail', id: decodeURIComponent(invoice[1]!) };
  if (window.location.pathname === '/work-logs') return { page: 'work-logs' };
  if (window.location.pathname === '/work-logs/new')
    return { page: 'work-log-new' };
  const workLogEdit = window.location.pathname.match(
    /^\/work-logs\/([^/]+)\/edit$/,
  );
  if (workLogEdit)
    return {
      page: 'work-log-edit',
      id: decodeURIComponent(workLogEdit[1]!),
    };
  const workLog = window.location.pathname.match(/^\/work-logs\/([^/]+)$/);
  if (workLog)
    return {
      page: 'work-log-detail',
      id: decodeURIComponent(workLog[1]!),
    };
  if (window.location.pathname === '/engagements')
    return { page: 'engagements' };
  if (window.location.pathname === '/engagements/new')
    return { page: 'engagement-new' };
  const engagementEdit = window.location.pathname.match(
    /^\/engagements\/([^/]+)\/edit$/,
  );
  if (engagementEdit)
    return {
      page: 'engagement-edit',
      id: decodeURIComponent(engagementEdit[1]!),
    };
  const engagement = window.location.pathname.match(/^\/engagements\/([^/]+)$/);
  if (engagement)
    return {
      page: 'engagement-detail',
      id: decodeURIComponent(engagement[1]!),
    };
  if (window.location.pathname === '/contracts') return { page: 'contracts' };
  if (window.location.pathname === '/contracts/new')
    return { page: 'contract-new' };
  const contractEdit = window.location.pathname.match(
    /^\/contracts\/([^/]+)\/edit$/,
  );
  if (contractEdit)
    return {
      page: 'contract-edit',
      id: decodeURIComponent(contractEdit[1]!),
    };
  const contract = window.location.pathname.match(/^\/contracts\/([^/]+)$/);
  if (contract)
    return { page: 'contract-detail', id: decodeURIComponent(contract[1]!) };
  if (window.location.pathname === '/interviews') return { page: 'interviews' };
  if (window.location.pathname === '/interviews/new')
    return { page: 'interview-new' };
  const interviewEdit = window.location.pathname.match(
    /^\/interviews\/([^/]+)\/edit$/,
  );
  if (interviewEdit)
    return {
      page: 'interview-edit',
      id: decodeURIComponent(interviewEdit[1]!),
    };
  const interviewResult = window.location.pathname.match(
    /^\/interviews\/([^/]+)\/result$/,
  );
  if (interviewResult)
    return {
      page: 'interview-result',
      id: decodeURIComponent(interviewResult[1]!),
    };
  const interview = window.location.pathname.match(/^\/interviews\/([^/]+)$/);
  if (interview)
    return { page: 'interview-detail', id: decodeURIComponent(interview[1]!) };
  if (window.location.pathname === '/proposals') return { page: 'proposals' };
  if (window.location.pathname === '/proposals/new')
    return { page: 'proposal-new' };
  const proposalEdit = window.location.pathname.match(
    /^\/proposals\/([^/]+)\/edit$/,
  );
  if (proposalEdit)
    return {
      page: 'proposal-edit',
      id: decodeURIComponent(proposalEdit[1]!),
    };
  const proposal = window.location.pathname.match(/^\/proposals\/([^/]+)$/);
  if (proposal)
    return { page: 'proposal-detail', id: decodeURIComponent(proposal[1]!) };
  if (window.location.pathname === '/engineers') return { page: 'engineers' };
  if (window.location.pathname === '/engineers/new')
    return { page: 'engineer-new' };
  const engineerEdit = window.location.pathname.match(
    /^\/engineers\/([^/]+)\/edit$/,
  );
  if (engineerEdit)
    return { page: 'engineer-edit', id: decodeURIComponent(engineerEdit[1]!) };
  const engineer = window.location.pathname.match(/^\/engineers\/([^/]+)$/);
  if (engineer)
    return { page: 'engineer-detail', id: decodeURIComponent(engineer[1]!) };
  if (window.location.pathname === '/contacts') return { page: 'contacts' };
  const contact = window.location.pathname.match(/^\/contacts\/([^/]+)$/);
  if (contact)
    return { page: 'contact-detail', id: decodeURIComponent(contact[1]!) };
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

function money(value: number, currency: string) {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function InvoiceListView({
  api,
  onOpen,
  onUnauthorized,
}: {
  api: ProjectsApi;
  onOpen: (id: string) => void;
  onUnauthorized: () => Promise<void>;
}) {
  const [items, setItems] = useState<InvoiceSummary[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [invoiceType, setInvoiceType] = useState<InvoiceType | ''>('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listInvoices({
        ...(query.trim() ? { q: query.trim() } : {}),
        ...(status ? { status } : {}),
        ...(invoiceType ? { invoiceType } : {}),
        ...(dueFrom ? { dueFrom } : {}),
        ...(dueTo ? { dueTo } : {}),
        limit: 100,
      });
      setItems(result.items);
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.status === 401)
        await onUnauthorized();
      else
        setError(
          reason instanceof Error
            ? reason.message
            : '請求一覧を取得できませんでした。',
        );
    } finally {
      setLoading(false);
    }
  }, [api, dueFrom, dueTo, invoiceType, onUnauthorized, query, status]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="content-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Finance</p>
          <h2>請求</h2>
        </div>
      </div>
      <div className="filter-row">
        <input
          aria-label="請求検索"
          placeholder="請求番号・会社・契約名"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="請求状態"
          value={status}
          onChange={(e) => setStatus(e.target.value as InvoiceStatus | '')}
        >
          <option value="">すべての状態</option>
          {Object.entries(invoiceStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="請求種別"
          value={invoiceType}
          onChange={(e) => setInvoiceType(e.target.value as InvoiceType | '')}
        >
          <option value="">すべての種別</option>
          {Object.entries(invoiceTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label>
          期限（開始）
          <input
            type="date"
            value={dueFrom}
            onChange={(e) => setDueFrom(e.target.value)}
          />
        </label>
        <label>
          期限（終了）
          <input
            type="date"
            value={dueTo}
            onChange={(e) => setDueTo(e.target.value)}
          />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">請求一覧を読み込んでいます…</p>
      ) : items.length === 0 ? (
        <p>該当する請求はありません。</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>請求番号</th>
                <th>種別</th>
                <th>請求先</th>
                <th>発行日</th>
                <th>支払期限</th>
                <th>状態</th>
                <th>請求額</th>
                <th>未入金</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button
                      className="link-button"
                      onClick={() => onOpen(item.id)}
                    >
                      {item.invoiceNo}
                    </button>
                  </td>
                  <td>{invoiceTypeLabels[item.invoiceType]}</td>
                  <td>{item.billingCompanyName}</td>
                  <td>{item.issueDate}</td>
                  <td>{item.dueDate}</td>
                  <td>{invoiceStatusLabels[item.status]}</td>
                  <td>{money(item.totalAmount, item.currency)}</td>
                  <td>{money(item.balanceAmount, item.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function InvoiceDetailView({
  api,
  id,
  onBack,
  onOpenContract,
  onUnauthorized,
}: {
  api: ProjectsApi;
  id: string;
  onBack: () => void;
  onOpenContract: (id: string) => void;
  onUnauthorized: () => Promise<void>;
}) {
  const [item, setItem] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    api
      .getInvoice(id)
      .then((value) => {
        if (active) setItem(value);
      })
      .catch(async (reason) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          await onUnauthorized();
        else if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : '請求を取得できませんでした。',
          );
      });
    return () => {
      active = false;
    };
  }, [api, id, onUnauthorized]);
  if (error)
    return (
      <section className="content-panel">
        <button className="secondary-button" onClick={onBack}>
          請求一覧へ戻る
        </button>
        <p role="alert">{error}</p>
      </section>
    );
  if (!item)
    return (
      <section className="content-panel">
        <p role="status">請求を読み込んでいます…</p>
      </section>
    );
  return (
    <section className="content-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{invoiceTypeLabels[item.invoiceType]}</p>
          <h2>{item.invoiceNo}</h2>
        </div>
        <button className="secondary-button" onClick={onBack}>
          請求一覧へ戻る
        </button>
      </div>
      <dl className="detail-grid">
        <div>
          <dt>請求先</dt>
          <dd>{item.billingCompanyName}</dd>
        </div>
        <div>
          <dt>契約</dt>
          <dd>
            {item.contractId ? (
              <button
                className="link-button"
                onClick={() => onOpenContract(item.contractId!)}
              >
                {item.contractTitle ?? item.contractId}
              </button>
            ) : (
              '―'
            )}
          </dd>
        </div>
        <div>
          <dt>対象期間</dt>
          <dd>
            {item.billingPeriodStart ?? '―'} 〜 {item.billingPeriodEnd ?? '―'}
          </dd>
        </div>
        <div>
          <dt>発行日 / 支払期限</dt>
          <dd>
            {item.issueDate} / {item.dueDate}
          </dd>
        </div>
        <div>
          <dt>状態</dt>
          <dd>{invoiceStatusLabels[item.status]}</dd>
        </div>
        <div>
          <dt>請求先設定</dt>
          <dd>
            {item.billingAccount.accountName}（
            {item.billingAccount.invoiceDeliveryMethod}）
          </dd>
        </div>
        <div>
          <dt>請求額</dt>
          <dd>{money(item.totalAmount, item.currency)}</dd>
        </div>
        <div>
          <dt>入金済 / 未入金</dt>
          <dd>
            {money(item.paidAmount, item.currency)} /{' '}
            {money(item.balanceAmount, item.currency)}
          </dd>
        </div>
      </dl>
      <h3>請求明細</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>内容</th>
              <th>数量</th>
              <th>単価</th>
              <th>税率</th>
              <th>金額</th>
            </tr>
          </thead>
          <tbody>
            {item.items.map((line) => (
              <tr key={line.id}>
                <td>{line.lineNo}</td>
                <td>{line.description}</td>
                <td>
                  {line.quantity} {line.unit ?? ''}
                </td>
                <td>{money(line.unitPrice, item.currency)}</td>
                <td>{line.taxRate}%</td>
                <td>{money(line.amount, item.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>入金履歴</h3>
      {item.payments.length === 0 ? (
        <p>入金履歴はありません。</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>入金日</th>
                <th>種別</th>
                <th>方法</th>
                <th>金額</th>
              </tr>
            </thead>
            <tbody>
              {item.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.paymentDate}</td>
                  <td>{payment.paymentType}</td>
                  <td>{payment.paymentMethod ?? '―'}</td>
                  <td>{money(payment.amount, payment.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function WorkLogListView({
  api,
  onOpen,
  onCreate,
  onUnauthorized,
}: {
  api: ProjectsApi;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onUnauthorized: () => Promise<void>;
}) {
  const [items, setItems] = useState<WorkLogSummary[]>([]);
  const [status, setStatus] = useState<WorkLogStatus | ''>('');
  const [query, setQuery] = useState('');
  const [workMonth, setWorkMonth] = useState('');
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const load = useCallback(
    async (cursor?: string, append = false) => {
      try {
        const result = await api.listWorkLogs({
          ...(query ? { q: query } : {}),
          ...(status ? { status } : {}),
          ...(workMonth ? { workMonth: `${workMonth}-01` } : {}),
          ...(cursor ? { cursor } : {}),
        });
        setItems((current) =>
          append ? [...current, ...result.items] : result.items,
        );
        setNextCursor(result.page.nextCursor);
        setError('');
      } catch (reason) {
        if (reason instanceof ApiClientError && reason.status === 401)
          await onUnauthorized();
        else
          setError(
            reason instanceof Error
              ? reason.message
              : '月次実績一覧を取得できませんでした。',
          );
      }
    },
    [api, onUnauthorized, query, status, workMonth],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="content-panel">
      <div className="section-heading">
        <div>
          <h2>月次実績</h2>
          <p>契約の認可境界を引き継いだ勤務実績を表示します。</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          月次実績を登録
        </button>
      </div>
      <div className="filter-row">
        <input
          aria-label="契約番号、契約件名または技術者名で検索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="契約番号・契約件名・技術者名"
        />
        <select
          aria-label="月次実績状態"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as WorkLogStatus | '')
          }
        >
          <option value="">すべての状態</option>
          {Object.entries(workLogStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          aria-label="対象月"
          type="month"
          value={workMonth}
          onChange={(event) => setWorkMonth(event.target.value)}
        />
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <table>
        <thead>
          <tr>
            <th>対象月</th>
            <th>技術者</th>
            <th>契約件名</th>
            <th>状態</th>
            <th>実績日数</th>
            <th>実績時間</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <button className="link-button" onClick={() => onOpen(item.id)}>
                  {item.workMonth.slice(0, 7)}
                </button>
              </td>
              <td>{item.engineerName}</td>
              <td>{item.contractTitle}</td>
              <td>{workLogStatusLabels[item.status]}</td>
              <td>{item.actualDays ?? '未入力'}</td>
              <td>{item.actualHours ?? '未入力'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && !error ? (
        <p>該当する月次実績はありません。</p>
      ) : null}
      {nextCursor ? (
        <button
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

function WorkLogDetail({
  api,
  id,
  onBack,
  onOpenContract,
  onEdit,
  onUnauthorized,
}: {
  api: ProjectsApi;
  id: string;
  onBack: () => void;
  onOpenContract: (id: string) => void;
  onEdit: () => void;
  onUnauthorized: () => Promise<void>;
}) {
  const [item, setItem] = useState<WorkLog | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [nextStatus, setNextStatus] = useState<
    Exclude<WorkLogStatus, 'draft'> | ''
  >('');
  const [reason, setReason] = useState('');
  const [approvedByName, setApprovedByName] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void api
      .getWorkLog(id)
      .then(setItem)
      .catch(async (reason: unknown) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          await onUnauthorized();
        else
          setError(
            reason instanceof Error
              ? reason.message
              : '月次実績を取得できませんでした。',
          );
      });
  }, [api, id, onUnauthorized]);
  async function transition(event: FormEvent) {
    event.preventDefault();
    if (!item || !nextStatus) return;
    setSaving(true);
    setActionError('');
    try {
      const updated = await api.transitionWorkLogStatus(
        item.id,
        item.rowVersion,
        {
          status: nextStatus,
          reason: reason.trim() || null,
          approvedByName: approvedByName.trim() || null,
        },
      );
      setItem(updated);
      setNextStatus('');
      setReason('');
      setApprovedByName('');
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.status === 401)
        await onUnauthorized();
      else
        setActionError(
          failure instanceof Error
            ? failure.message
            : '月次実績の状態を更新できませんでした。',
        );
    } finally {
      setSaving(false);
    }
  }
  if (error)
    return (
      <section className="content-panel">
        <p role="alert">{error}</p>
        <button className="secondary-button" onClick={onBack}>
          月次実績一覧へ戻る
        </button>
      </section>
    );
  if (!item)
    return (
      <section className="content-panel" role="status">
        月次実績を読み込んでいます…
      </section>
    );
  return (
    <section className="content-panel">
      <div className="section-heading">
        <div>
          <h2>{item.workMonth.slice(0, 7)} 月次実績</h2>
          <p>{item.engineerName}</p>
        </div>
        <div className="filter-row">
          {['draft', 'rejected'].includes(item.status) ? (
            <button className="primary-button" onClick={onEdit}>
              編集
            </button>
          ) : null}
          <button className="secondary-button" onClick={onBack}>
            月次実績一覧へ戻る
          </button>
        </div>
      </div>
      <dl className="detail-grid">
        <dt>契約</dt>
        <dd>
          <button
            className="link-button"
            onClick={() => onOpenContract(item.contractId)}
          >
            {item.contractTitle}
          </button>
        </dd>
        <dt>状態</dt>
        <dd>{workLogStatusLabels[item.status]}</dd>
        <dt>予定</dt>
        <dd>
          {item.scheduledDays ?? '未設定'}日 / {item.scheduledHours ?? '未設定'}
          時間
        </dd>
        <dt>実績</dt>
        <dd>
          {item.actualDays ?? '未設定'}日 / {item.actualHours ?? '未設定'}時間
        </dd>
        <dt>時間内訳</dt>
        <dd>
          残業 {item.overtimeHours}時間 / 欠勤 {item.absenceHours}時間
        </dd>
        <dt>顧客承認</dt>
        <dd>
          {item.customerApprovedAt ?? '未承認'}
          {item.approvedByName ? `（${item.approvedByName}）` : ''}
        </dd>
        <dt>備考</dt>
        <dd>{item.notes ?? 'なし'}</dd>
      </dl>
      <h3>日次実績</h3>
      <table>
        <thead>
          <tr>
            <th>日付</th>
            <th>区分</th>
            <th>開始</th>
            <th>終了</th>
            <th>休憩</th>
            <th>勤務時間</th>
            <th>残業</th>
            <th>内容</th>
          </tr>
        </thead>
        <tbody>
          {item.details.map((detail) => (
            <tr key={detail.id}>
              <td>{detail.workDate}</td>
              <td>{workTypeLabels[detail.workType]}</td>
              <td>{detail.startTime ?? '—'}</td>
              <td>{detail.endTime ?? '—'}</td>
              <td>{detail.breakMinutes}分</td>
              <td>{detail.workHours}時間</td>
              <td>{detail.overtimeHours}時間</td>
              <td>{detail.description ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {item.details.length === 0 ? <p>日次実績はありません。</p> : null}
      <h3>承認状況</h3>
      <p>
        {item.approval
          ? `${item.approval.status} / ${item.approval.requestedAt ?? '日時未記録'}`
          : '承認依頼はありません。'}
      </p>
      <h3>状態履歴</h3>
      <ul>
        {item.statusHistories.map((history) => (
          <li key={history.id}>
            {history.changedAt}: {workLogStatusLabels[history.toStatus]}
            {history.changeReason ? ` / ${history.changeReason}` : ''}
          </li>
        ))}
      </ul>
      {item.status !== 'locked' ? (
        <form
          className="project-form"
          onSubmit={(event) => void transition(event)}
        >
          <h3>提出・承認</h3>
          {actionError ? <p role="alert">{actionError}</p> : null}
          <label>
            次の月次実績状態
            <select
              required
              value={nextStatus}
              onChange={(event) =>
                setNextStatus(
                  event.target.value as Exclude<WorkLogStatus, 'draft'> | '',
                )
              }
            >
              <option value="">選択してください</option>
              {item.status === 'draft' || item.status === 'rejected' ? (
                <option value="submitted">承認依頼を提出</option>
              ) : item.status === 'submitted' ? (
                <>
                  <option value="approved">承認</option>
                  <option value="rejected">差戻し</option>
                </>
              ) : (
                <option value="locked">月次実績を締める</option>
              )}
            </select>
          </label>
          <label>
            変更理由
            <textarea
              maxLength={1000}
              required={nextStatus === 'rejected'}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {nextStatus === 'approved' ? (
            <label>
              顧客承認者名
              <input
                required
                maxLength={300}
                value={approvedByName}
                onChange={(event) => setApprovedByName(event.target.value)}
              />
            </label>
          ) : null}
          <button className="primary-button" disabled={saving || !nextStatus}>
            {saving ? '更新中…' : '月次実績の状態を更新'}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function WorkLogForm({
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
  const emptyDetail: WorkLogInput['details'][number] = {
    workDate: '',
    workType: 'work',
    startTime: null,
    endTime: null,
    breakMinutes: 60,
    workHours: 8,
    overtimeHours: 0,
    description: null,
  };
  const [input, setInput] = useState<WorkLogInput>({
    contractId: '',
    engineerId: '',
    workMonth: '',
    scheduledDays: null,
    scheduledHours: null,
    absenceHours: 0,
    notes: null,
    details: [{ ...emptyDetail }],
  });
  const [rowVersion, setRowVersion] = useState(0);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    void api
      .getWorkLog(id)
      .then((item) => {
        setInput({
          contractId: item.contractId,
          engineerId: item.engineerId,
          workMonth: item.workMonth,
          scheduledDays: item.scheduledDays,
          scheduledHours: item.scheduledHours,
          absenceHours: item.absenceHours,
          notes: item.notes,
          details: item.details.map((detail) => ({
            workDate: detail.workDate,
            workType: detail.workType,
            startTime: detail.startTime?.slice(0, 5) ?? null,
            endTime: detail.endTime?.slice(0, 5) ?? null,
            breakMinutes: detail.breakMinutes,
            workHours: detail.workHours,
            overtimeHours: detail.overtimeHours,
            description: detail.description,
          })),
        });
        setRowVersion(item.rowVersion);
      })
      .catch((failure: unknown) =>
        setError(
          failure instanceof Error
            ? failure.message
            : '月次実績を読み込めませんでした。',
        ),
      )
      .finally(() => setLoading(false));
  }, [api, id]);
  const set = <K extends keyof WorkLogInput>(key: K, value: WorkLogInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));
  const setDetail = <K extends keyof WorkLogInput['details'][number]>(
    index: number,
    key: K,
    value: WorkLogInput['details'][number][K],
  ) =>
    setInput((current) => ({
      ...current,
      details: current.details.map((detail, itemIndex) =>
        itemIndex === index ? { ...detail, [key]: value } : detail,
      ),
    }));
  const nullableNumber = (value: string) =>
    value === '' ? null : Number(value);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = id
        ? await api.updateWorkLog(id, rowVersion, input)
        : await api.createWorkLog(input);
      onSaved(saved.id);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : '月次実績を保存できませんでした。',
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <section className="content-panel" role="status">
        月次実績を読み込んでいます…
      </section>
    );
  return (
    <section className="content-panel">
      <h2>{id ? '月次実績を編集' : '月次実績を登録'}</h2>
      {error ? <p role="alert">{error}</p> : null}
      <form className="project-form" onSubmit={(event) => void submit(event)}>
        <label>
          契約ID
          <input
            required
            disabled={Boolean(id)}
            value={input.contractId}
            onChange={(event) => set('contractId', event.target.value)}
          />
        </label>
        <label>
          技術者ID
          <input
            required
            disabled={Boolean(id)}
            value={input.engineerId}
            onChange={(event) => set('engineerId', event.target.value)}
          />
        </label>
        <label>
          対象月
          <input
            required
            type="month"
            disabled={Boolean(id)}
            value={input.workMonth.slice(0, 7)}
            onChange={(event) =>
              set(
                'workMonth',
                event.target.value ? `${event.target.value}-01` : '',
              )
            }
          />
        </label>
        <label>
          予定日数
          <input
            type="number"
            min="0"
            step="0.01"
            value={input.scheduledDays ?? ''}
            onChange={(event) =>
              set('scheduledDays', nullableNumber(event.target.value))
            }
          />
        </label>
        <label>
          予定時間
          <input
            type="number"
            min="0"
            step="0.01"
            value={input.scheduledHours ?? ''}
            onChange={(event) =>
              set('scheduledHours', nullableNumber(event.target.value))
            }
          />
        </label>
        <label>
          欠勤時間
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={input.absenceHours}
            onChange={(event) =>
              set('absenceHours', Number(event.target.value))
            }
          />
        </label>
        <label>
          備考
          <textarea
            maxLength={5000}
            value={input.notes ?? ''}
            onChange={(event) => set('notes', event.target.value || null)}
          />
        </label>
        <fieldset>
          <legend>日次実績</legend>
          {input.details.map((detail, index) => (
            <div className="project-form" key={`${index}-${detail.workDate}`}>
              <h4>日次実績 {index + 1}</h4>
              <label>
                勤務日
                <input
                  required
                  type="date"
                  value={detail.workDate}
                  onChange={(event) =>
                    setDetail(index, 'workDate', event.target.value)
                  }
                />
              </label>
              <label>
                勤務区分
                <select
                  value={detail.workType}
                  onChange={(event) =>
                    setDetail(index, 'workType', event.target.value as WorkType)
                  }
                >
                  {Object.entries(workTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                開始時刻
                <input
                  type="time"
                  value={detail.startTime ?? ''}
                  onChange={(event) =>
                    setDetail(index, 'startTime', event.target.value || null)
                  }
                />
              </label>
              <label>
                終了時刻
                <input
                  type="time"
                  value={detail.endTime ?? ''}
                  onChange={(event) =>
                    setDetail(index, 'endTime', event.target.value || null)
                  }
                />
              </label>
              <label>
                休憩時間（分）
                <input
                  required
                  type="number"
                  min="0"
                  max="1440"
                  value={detail.breakMinutes}
                  onChange={(event) =>
                    setDetail(index, 'breakMinutes', Number(event.target.value))
                  }
                />
              </label>
              <label>
                勤務時間
                <input
                  required
                  type="number"
                  min="0"
                  max="24"
                  step="0.01"
                  value={detail.workHours}
                  onChange={(event) =>
                    setDetail(index, 'workHours', Number(event.target.value))
                  }
                />
              </label>
              <label>
                残業時間
                <input
                  required
                  type="number"
                  min="0"
                  max="24"
                  step="0.01"
                  value={detail.overtimeHours}
                  onChange={(event) =>
                    setDetail(
                      index,
                      'overtimeHours',
                      Number(event.target.value),
                    )
                  }
                />
              </label>
              <label>
                作業内容
                <textarea
                  maxLength={1000}
                  value={detail.description ?? ''}
                  onChange={(event) =>
                    setDetail(index, 'description', event.target.value || null)
                  }
                />
              </label>
              {input.details.length > 1 ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    set(
                      'details',
                      input.details.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    )
                  }
                >
                  この日次実績を削除
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            className="secondary-button"
            disabled={input.details.length >= 31}
            onClick={() =>
              set('details', [...input.details, { ...emptyDetail }])
            }
          >
            日次実績を追加
          </button>
        </fieldset>
        <div className="filter-row">
          <button className="primary-button" disabled={saving}>
            {saving ? '保存中…' : id ? '月次実績を保存' : '月次実績を登録'}
          </button>
          <button type="button" className="secondary-button" onClick={onCancel}>
            キャンセル
          </button>
        </div>
      </form>
    </section>
  );
}

function EngagementListView({
  api,
  onOpen,
  onCreate,
  onUnauthorized,
}: {
  api: ProjectsApi;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onUnauthorized: () => Promise<void>;
}) {
  const [items, setItems] = useState<EngagementSummary[]>([]);
  const [status, setStatus] = useState<EngagementStatus | ''>('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const load = useCallback(
    async (cursor?: string, append = false) => {
      try {
        const result = await api.listEngagements({
          ...(query ? { q: query } : {}),
          ...(status ? { status } : {}),
          ...(cursor ? { cursor } : {}),
        });
        setItems((current) =>
          append ? [...current, ...result.items] : result.items,
        );
        setNextCursor(result.page.nextCursor);
        setError('');
      } catch (reason) {
        if (reason instanceof ApiClientError && reason.status === 401)
          await onUnauthorized();
        else
          setError(
            reason instanceof Error
              ? reason.message
              : '参画一覧を取得できませんでした。',
          );
      }
    },
    [api, onUnauthorized, query, status],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="content-panel">
      <div className="section-heading">
        <div>
          <h2>参画</h2>
          <p>契約の認可境界を引き継いだ参画情報を表示します。</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          参画を登録
        </button>
      </div>
      <div className="filter-row">
        <input
          aria-label="参画番号、契約件名または技術者名で検索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="参画番号・契約件名・技術者名"
        />
        <select
          aria-label="参画状態"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as EngagementStatus | '')
          }
        >
          <option value="">すべての状態</option>
          {Object.entries(engagementStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <table>
        <thead>
          <tr>
            <th>参画番号</th>
            <th>技術者</th>
            <th>契約件名</th>
            <th>状態</th>
            <th>予定期間</th>
            <th>役割</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <button className="link-button" onClick={() => onOpen(item.id)}>
                  {item.engagementNo}
                </button>
              </td>
              <td>{item.engineerName}</td>
              <td>{item.contractTitle}</td>
              <td>{engagementStatusLabels[item.status]}</td>
              <td>
                {item.plannedStartDate ?? '未定'} ～{' '}
                {item.plannedEndDate ?? '未定'}
              </td>
              <td>{item.roleName ?? '未設定'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && !error ? <p>該当する参画はありません。</p> : null}
      {nextCursor ? (
        <button
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

function EngagementDetail({
  api,
  id,
  onBack,
  onOpenContract,
  onEdit,
  onUnauthorized,
}: {
  api: ProjectsApi;
  id: string;
  onBack: () => void;
  onOpenContract: (id: string) => void;
  onEdit: () => void;
  onUnauthorized: () => Promise<void>;
}) {
  const [item, setItem] = useState<Engagement | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [nextStatus, setNextStatus] = useState<
    Exclude<EngagementStatus, 'draft'> | ''
  >('');
  const [reason, setReason] = useState('');
  const [actualDate, setActualDate] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void api
      .getEngagement(id)
      .then((result) => {
        setItem(result);
        setError('');
      })
      .catch((reason: unknown) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          void onUnauthorized();
        else
          setError(
            reason instanceof Error
              ? reason.message
              : '参画詳細を取得できませんでした。',
          );
      });
  }, [api, id, onUnauthorized]);
  async function transition(event: FormEvent) {
    event.preventDefault();
    if (!item || !nextStatus) return;
    setSaving(true);
    setActionError('');
    try {
      const updated = await api.transitionEngagementStatus(
        item.id,
        item.rowVersion,
        {
          status: nextStatus,
          reason: reason.trim() || null,
          actualDate: actualDate || null,
        },
      );
      setItem(updated);
      setNextStatus('');
      setReason('');
      setActualDate('');
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.status === 401)
        await onUnauthorized();
      else
        setActionError(
          failure instanceof Error
            ? failure.message
            : '参画状態を更新できませんでした。',
        );
    } finally {
      setSaving(false);
    }
  }
  if (error)
    return (
      <section className="content-panel">
        <p role="alert">{error}</p>
        <button className="secondary-button" onClick={onBack}>
          参画一覧へ戻る
        </button>
      </section>
    );
  if (!item)
    return (
      <section className="content-panel" role="status">
        参画を読み込んでいます…
      </section>
    );
  const amount = (value: number | null, currency: string) =>
    value === null ? '未設定' : `${value.toLocaleString()} ${currency}`;
  return (
    <section className="content-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{item.engagementNo}</p>
          <h2>{item.engineerName}</h2>
          <p>{item.contractTitle}</p>
        </div>
        <div className="filter-row">
          {item.status === 'draft' ? (
            <button className="primary-button" onClick={onEdit}>
              編集
            </button>
          ) : null}
          <button className="secondary-button" onClick={onBack}>
            参画一覧へ戻る
          </button>
        </div>
      </div>
      <dl className="detail-grid">
        <dt>状態</dt>
        <dd>{engagementStatusLabels[item.status]}</dd>
        <dt>契約</dt>
        <dd>
          <button
            className="link-button"
            onClick={() => onOpenContract(item.contractId)}
          >
            {item.contractTitle}
          </button>
        </dd>
        <dt>予定期間</dt>
        <dd>
          {item.plannedStartDate ?? '未定'} ～ {item.plannedEndDate ?? '未定'}
        </dd>
        <dt>実績期間</dt>
        <dd>
          {item.actualStartDate ?? '未開始'} ～ {item.actualEndDate ?? '継続中'}
        </dd>
        <dt>役割</dt>
        <dd>{item.roleName ?? '未設定'}</dd>
        <dt>勤務地</dt>
        <dd>{item.workLocation ?? '未設定'}</dd>
        <dt>リモート頻度</dt>
        <dd>{item.remoteFrequency ?? '未設定'}</dd>
        <dt>前回参画ID</dt>
        <dd>{item.previousEngagementId ?? 'なし'}</dd>
        <dt>版番号</dt>
        <dd>{item.rowVersion}</dd>
        <dt>条件履歴</dt>
        <dd>
          {item.conditions.length === 0 ? (
            '未登録'
          ) : (
            <ol>
              {item.conditions.map((condition) => (
                <li key={condition.id}>
                  第{condition.versionNo}版 / {condition.effectiveFrom} ～{' '}
                  {condition.effectiveTo ?? '継続中'} / 売上{' '}
                  {amount(condition.monthlySalesAmount, condition.currency)} /
                  原価 {amount(condition.monthlyCostAmount, condition.currency)}{' '}
                  / 精算 {condition.settlementLowerHours ?? '未設定'}～
                  {condition.settlementUpperHours ?? '未設定'}時間
                  {condition.notes ? ` / ${condition.notes}` : ''}
                </li>
              ))}
            </ol>
          )}
        </dd>
        <dt>状態履歴</dt>
        <dd>
          {item.statusHistories.length === 0 ? (
            '未登録'
          ) : (
            <ol>
              {item.statusHistories.map((history) => (
                <li key={history.id}>
                  {history.changedAt} /{' '}
                  {history.fromStatus
                    ? engagementStatusLabels[history.fromStatus]
                    : '新規'}{' '}
                  → {engagementStatusLabels[history.toStatus]}
                  {history.changeReason ? ` / ${history.changeReason}` : ''}
                </li>
              ))}
            </ol>
          )}
        </dd>
      </dl>
      {!['ended', 'cancelled'].includes(item.status) ? (
        <form
          className="project-form"
          onSubmit={(event) => void transition(event)}
        >
          <h3>参画状態</h3>
          {actionError ? <p role="alert">{actionError}</p> : null}
          <label>
            次の参画状態
            <select
              required
              value={nextStatus}
              onChange={(event) =>
                setNextStatus(
                  event.target.value as Exclude<EngagementStatus, 'draft'> | '',
                )
              }
            >
              <option value="">選択してください</option>
              {item.status === 'draft' ? (
                <>
                  <option value="preparing">参画準備中へ</option>
                  <option value="cancelled">開始前取消</option>
                </>
              ) : item.status === 'preparing' ? (
                <>
                  <option value="active">参画開始</option>
                  <option value="cancelled">開始前取消</option>
                </>
              ) : item.status === 'active' ? (
                <option value="ending">終了手続開始</option>
              ) : (
                <option value="ended">参画終了</option>
              )}
            </select>
          </label>
          <label>
            実績日
            <input
              aria-label="参画実績日"
              type="date"
              value={actualDate}
              onChange={(event) => setActualDate(event.target.value)}
            />
          </label>
          <label>
            変更理由
            <textarea
              maxLength={1000}
              required={nextStatus === 'ended' || nextStatus === 'cancelled'}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={saving || !nextStatus}>
            {saving ? '更新中…' : '参画状態を更新'}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function EngagementForm({
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
  const empty: EngagementInput = {
    engagementNo: '',
    contractId: '',
    engineerId: '',
    previousEngagementId: null,
    plannedStartDate: '',
    plannedEndDate: null,
    roleName: null,
    workLocation: null,
    remoteFrequency: null,
    condition: {
      effectiveFrom: '',
      effectiveTo: null,
      monthlySalesAmount: null,
      monthlyCostAmount: null,
      currency: 'JPY',
      settlementLowerHours: null,
      settlementUpperHours: null,
      notes: null,
    },
  };
  const [input, setInput] = useState<EngagementInput>(empty);
  const [rowVersion, setRowVersion] = useState(0);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    void api
      .getEngagement(id)
      .then((item) => {
        const condition = item.conditions[0];
        setInput({
          engagementNo: item.engagementNo,
          contractId: item.contractId,
          engineerId: item.engineerId,
          previousEngagementId: item.previousEngagementId,
          plannedStartDate: item.plannedStartDate ?? '',
          plannedEndDate: item.plannedEndDate,
          roleName: item.roleName,
          workLocation: item.workLocation,
          remoteFrequency: item.remoteFrequency,
          condition: {
            effectiveFrom:
              condition?.effectiveFrom ?? item.plannedStartDate ?? '',
            effectiveTo: condition?.effectiveTo ?? null,
            monthlySalesAmount: condition?.monthlySalesAmount ?? null,
            monthlyCostAmount: condition?.monthlyCostAmount ?? null,
            currency: condition?.currency ?? 'JPY',
            settlementLowerHours: condition?.settlementLowerHours ?? null,
            settlementUpperHours: condition?.settlementUpperHours ?? null,
            notes: condition?.notes ?? null,
          },
        });
        setRowVersion(item.rowVersion);
      })
      .catch((failure: unknown) =>
        setError(
          failure instanceof Error
            ? failure.message
            : '参画を読み込めませんでした。',
        ),
      )
      .finally(() => setLoading(false));
  }, [api, id]);
  const set = <K extends keyof EngagementInput>(
    key: K,
    value: EngagementInput[K],
  ) => setInput((current) => ({ ...current, [key]: value }));
  const setCondition = <K extends keyof EngagementInput['condition']>(
    key: K,
    value: EngagementInput['condition'][K],
  ) =>
    setInput((current) => ({
      ...current,
      condition: { ...current.condition, [key]: value },
    }));
  const nullableNumber = (value: string) =>
    value === '' ? null : Number(value);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = id
        ? await api.updateEngagement(id, rowVersion, input)
        : await api.createEngagement(input);
      onSaved(saved.id);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : '参画を保存できませんでした。',
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <section className="content-panel" role="status">
        参画を読み込んでいます…
      </section>
    );
  return (
    <section className="content-panel">
      <h2>{id ? '参画を編集' : '参画を登録'}</h2>
      {error ? <p role="alert">{error}</p> : null}
      <form className="project-form" onSubmit={(event) => void submit(event)}>
        <label>
          参画番号
          <input
            required
            maxLength={32}
            value={input.engagementNo}
            onChange={(e) => set('engagementNo', e.target.value)}
          />
        </label>
        <label>
          契約ID
          <input
            required
            disabled={Boolean(id)}
            value={input.contractId}
            onChange={(e) => set('contractId', e.target.value)}
          />
        </label>
        <label>
          技術者ID
          <input
            required
            disabled={Boolean(id)}
            value={input.engineerId}
            onChange={(e) => set('engineerId', e.target.value)}
          />
        </label>
        <label>
          前回参画ID
          <input
            value={input.previousEngagementId ?? ''}
            onChange={(e) =>
              set('previousEngagementId', e.target.value || null)
            }
          />
        </label>
        <label>
          参画予定開始日
          <input
            required
            type="date"
            value={input.plannedStartDate}
            onChange={(e) => {
              set('plannedStartDate', e.target.value);
              if (!input.condition.effectiveFrom)
                setCondition('effectiveFrom', e.target.value);
            }}
          />
        </label>
        <label>
          参画予定終了日
          <input
            type="date"
            value={input.plannedEndDate ?? ''}
            onChange={(e) => set('plannedEndDate', e.target.value || null)}
          />
        </label>
        <label>
          役割
          <input
            maxLength={300}
            value={input.roleName ?? ''}
            onChange={(e) => set('roleName', e.target.value || null)}
          />
        </label>
        <label>
          勤務地
          <input
            maxLength={500}
            value={input.workLocation ?? ''}
            onChange={(e) => {
              set('workLocation', e.target.value || null);
            }}
          />
        </label>
        <label>
          リモート頻度
          <input
            maxLength={200}
            value={input.remoteFrequency ?? ''}
            onChange={(e) => {
              set('remoteFrequency', e.target.value || null);
            }}
          />
        </label>
        <fieldset>
          <legend>初回参画条件</legend>
          <label>
            条件適用開始日
            <input
              required
              type="date"
              value={input.condition.effectiveFrom}
              onChange={(e) => setCondition('effectiveFrom', e.target.value)}
            />
          </label>
          <label>
            条件適用終了日
            <input
              type="date"
              value={input.condition.effectiveTo ?? ''}
              onChange={(e) =>
                setCondition('effectiveTo', e.target.value || null)
              }
            />
          </label>
          <label>
            月額売上
            <input
              type="number"
              min="0"
              value={input.condition.monthlySalesAmount ?? ''}
              onChange={(e) =>
                setCondition(
                  'monthlySalesAmount',
                  nullableNumber(e.target.value),
                )
              }
            />
          </label>
          <label>
            月額原価
            <input
              type="number"
              min="0"
              value={input.condition.monthlyCostAmount ?? ''}
              onChange={(e) =>
                setCondition(
                  'monthlyCostAmount',
                  nullableNumber(e.target.value),
                )
              }
            />
          </label>
          <label>
            通貨
            <input
              required
              pattern="[A-Z]{3}"
              value={input.condition.currency}
              onChange={(e) =>
                setCondition('currency', e.target.value.toUpperCase())
              }
            />
          </label>
          <label>
            精算下限時間
            <input
              type="number"
              min="0"
              step="0.01"
              value={input.condition.settlementLowerHours ?? ''}
              onChange={(e) =>
                setCondition(
                  'settlementLowerHours',
                  nullableNumber(e.target.value),
                )
              }
            />
          </label>
          <label>
            精算上限時間
            <input
              type="number"
              min="0"
              step="0.01"
              value={input.condition.settlementUpperHours ?? ''}
              onChange={(e) =>
                setCondition(
                  'settlementUpperHours',
                  nullableNumber(e.target.value),
                )
              }
            />
          </label>
          <label>
            条件備考
            <textarea
              maxLength={5000}
              value={input.condition.notes ?? ''}
              onChange={(e) => setCondition('notes', e.target.value || null)}
            />
          </label>
        </fieldset>
        <div className="filter-row">
          <button className="primary-button" disabled={saving}>
            {saving ? '保存中…' : id ? '参画を保存' : '参画を登録'}
          </button>
          <button type="button" className="secondary-button" onClick={onCancel}>
            キャンセル
          </button>
        </div>
      </form>
    </section>
  );
}

function ContractListView({
  api,
  onOpen,
  onCreate,
  onUnauthorized,
}: {
  api: ProjectsApi;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onUnauthorized: () => Promise<void>;
}) {
  const [items, setItems] = useState<ContractSummary[]>([]);
  const [status, setStatus] = useState<ContractStatus | ''>('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    void api
      .listContracts({
        ...(query ? { q: query } : {}),
        ...(status ? { status } : {}),
      })
      .then((result) => {
        setItems(result.items);
        setError('');
      })
      .catch((reason: unknown) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          void onUnauthorized();
        else
          setError(
            reason instanceof Error
              ? reason.message
              : '契約一覧を取得できませんでした。',
          );
      });
  }, [api, onUnauthorized, query, status]);
  return (
    <section className="content-panel">
      <div className="section-heading">
        <div>
          <h2>契約</h2>
          <p>権限に応じた安全な契約概要を表示します。</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          契約を登録
        </button>
      </div>
      <div className="filter-row">
        <input
          aria-label="契約番号または件名で検索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="契約番号・件名"
        />
        <select
          aria-label="契約状態"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as ContractStatus | '')
          }
        >
          <option value="">すべての状態</option>
          {Object.entries(contractStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {error && <p role="alert">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>契約番号</th>
            <th>件名</th>
            <th>状態</th>
            <th>契約形態</th>
            <th>契約期間</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <button className="link-button" onClick={() => onOpen(item.id)}>
                  {item.contractNo}
                </button>
              </td>
              <td>{item.title}</td>
              <td>{contractStatusLabels[item.status]}</td>
              <td>{contractTypeLabels[item.contractType]}</td>
              <td>
                {item.startDate} ～ {item.endDate ?? '未定'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && !error && <p>該当する契約はありません。</p>}
    </section>
  );
}

function ContractDetail({
  api,
  id,
  onBack,
  onEdit,
  onUnauthorized,
}: {
  api: ProjectsApi;
  id: string;
  onBack: () => void;
  onEdit: () => void;
  onUnauthorized: () => Promise<void>;
}) {
  const [item, setItem] = useState<Contract | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [nextStatus, setNextStatus] = useState<
    'review' | 'active' | 'draft' | ''
  >('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void api
      .getContract(id)
      .then((result) => {
        setItem(result);
        setError('');
      })
      .catch((reason: unknown) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          void onUnauthorized();
        else
          setError(
            reason instanceof Error
              ? reason.message
              : '契約詳細を取得できませんでした。',
          );
      });
  }, [api, id, onUnauthorized]);
  async function transition(event: FormEvent) {
    event.preventDefault();
    if (!item || !nextStatus) return;
    setSaving(true);
    setActionError('');
    try {
      const updated = await api.transitionContractStatus(
        item.id,
        item.rowVersion,
        { status: nextStatus, reason: reason.trim() || null },
      );
      setItem(updated);
      setNextStatus('');
      setReason('');
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.status === 401)
        await onUnauthorized();
      else
        setActionError(
          failure instanceof Error
            ? failure.message
            : '契約の承認状態を更新できませんでした。',
        );
    } finally {
      setSaving(false);
    }
  }
  if (error)
    return (
      <section className="content-panel">
        <p role="alert">{error}</p>
        <button className="secondary-button" onClick={onBack}>
          契約一覧へ戻る
        </button>
      </section>
    );
  if (!item)
    return (
      <section className="content-panel" role="status">
        契約を読み込んでいます…
      </section>
    );
  const amount = (value: number | null) =>
    value === null ? '未設定' : `${value.toLocaleString()} ${item.currency}`;
  return (
    <section className="content-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{item.contractNo}</p>
          <h2>{item.title}</h2>
        </div>
        <div className="filter-row">
          {item.status === 'draft' ? (
            <button className="primary-button" onClick={onEdit}>
              編集
            </button>
          ) : null}
          <button className="secondary-button" onClick={onBack}>
            契約一覧へ戻る
          </button>
        </div>
      </div>
      <dl className="detail-grid">
        <dt>状態</dt>
        <dd>{contractStatusLabels[item.status]}</dd>
        <dt>契約形態</dt>
        <dd>{contractTypeLabels[item.contractType]}</dd>
        <dt>契約期間</dt>
        <dd>
          {item.startDate} ～ {item.endDate ?? '未定'}
        </dd>
        <dt>自動更新</dt>
        <dd>{item.autoRenew ? 'あり' : 'なし'}</dd>
        <dt>月額</dt>
        <dd>{amount(item.monthlyAmount)}</dd>
        <dt>時間単価</dt>
        <dd>{amount(item.hourlyAmount)}</dd>
        <dt>精算幅</dt>
        <dd>
          {item.settlementLowerHours ?? '未設定'} ～{' '}
          {item.settlementUpperHours ?? '未設定'} 時間
        </dd>
        <dt>支払条件</dt>
        <dd>{item.paymentTerms ?? '未設定'}</dd>
        <dt>案件ID</dt>
        <dd>{item.projectId ?? '未設定'}</dd>
        <dt>提案ID</dt>
        <dd>{item.proposalId ?? '未設定'}</dd>
        <dt>技術者ID</dt>
        <dd>{item.engineerId ?? '未設定'}</dd>
        <dt>契約当事者</dt>
        <dd>
          {item.parties.length === 0 ? (
            '未登録'
          ) : (
            <ul>
              {item.parties.map((party) => (
                <li key={party.id}>
                  {party.companyId} / {party.partyRole}
                  {party.billingRole ? ` / ${party.billingRole}` : ''}
                  {party.isPrimary ? ' / 主契約先' : ''}
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt>契約版</dt>
        <dd>
          {item.versions.length === 0 ? (
            '未登録'
          ) : (
            <ol>
              {item.versions.map((version) => (
                <li key={version.id}>
                  第{version.versionNo}版 / {version.effectiveFrom} ～{' '}
                  {version.effectiveTo ?? '継続中'}
                  {version.changeSummary ? ` / ${version.changeSummary}` : ''}
                </li>
              ))}
            </ol>
          )}
        </dd>
        <dt>月次稼働</dt>
        <dd>
          {item.workLogs.length === 0 ? (
            '未登録'
          ) : (
            <ol>
              {item.workLogs.map((workLog) => (
                <li key={workLog.id}>
                  {workLog.workMonth} / {workLog.status} / 実績{' '}
                  {workLog.actualHours ?? '未入力'}時間
                </li>
              ))}
            </ol>
          )}
        </dd>
        <dt>備考</dt>
        <dd>{item.notes ?? '未設定'}</dd>
        <dt>承認状況</dt>
        <dd>
          {item.approval
            ? `${item.approval.status} / 依頼: ${item.approval.requestedAt ?? '未設定'} / 判断: ${item.approval.decisionNote ?? '未設定'}`
            : '承認依頼なし'}
        </dd>
        <dt>版番号</dt>
        <dd>{item.rowVersion}</dd>
      </dl>
      {item.status === 'draft' || item.status === 'review' ? (
        <form
          className="project-form"
          onSubmit={(event) => void transition(event)}
        >
          <h3>承認フロー</h3>
          {actionError ? <p role="alert">{actionError}</p> : null}
          <label>
            次の状態
            <select
              required
              value={nextStatus}
              onChange={(event) =>
                setNextStatus(
                  event.target.value as 'review' | 'active' | 'draft' | '',
                )
              }
            >
              <option value="">選択してください</option>
              {item.status === 'draft' ? (
                <option value="review">承認依頼</option>
              ) : (
                <>
                  <option value="active">承認して契約中へ</option>
                  <option value="draft">差戻し</option>
                </>
              )}
            </select>
          </label>
          <label>
            依頼・判断理由
            <textarea
              maxLength={1000}
              required={nextStatus === 'draft'}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={saving || !nextStatus}>
            {saving ? '更新中…' : '承認状態を更新'}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function ContractForm({
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
  const empty: ContractInput = {
    contractNo: '',
    projectId: null,
    proposalId: null,
    engineerId: null,
    contractType: 'ses',
    title: '',
    startDate: '',
    endDate: null,
    autoRenew: false,
    currency: 'JPY',
    monthlyAmount: null,
    hourlyAmount: null,
    settlementLowerHours: null,
    settlementUpperHours: null,
    paymentTerms: null,
    notes: null,
    parties: [],
    changeSummary: null,
  };
  const [input, setInput] = useState<ContractInput>(empty);
  const [rowVersion, setRowVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(id !== undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    void api
      .getContract(id)
      .then((contract) => {
        setInput({
          contractNo: contract.contractNo,
          projectId: contract.projectId,
          proposalId: contract.proposalId,
          engineerId: contract.engineerId,
          contractType: contract.contractType,
          title: contract.title,
          startDate: contract.startDate,
          endDate: contract.endDate,
          autoRenew: contract.autoRenew,
          currency: contract.currency,
          monthlyAmount: contract.monthlyAmount,
          hourlyAmount: contract.hourlyAmount,
          settlementLowerHours: contract.settlementLowerHours,
          settlementUpperHours: contract.settlementUpperHours,
          paymentTerms: contract.paymentTerms,
          notes: contract.notes,
          parties: contract.parties.map((party) => ({
            companyId: party.companyId,
            contactId: party.contactId,
            partyRole: party.partyRole,
            billingRole: party.billingRole,
            isPrimary: party.isPrimary,
          })),
          changeSummary: null,
        });
        setRowVersion(contract.rowVersion);
      })
      .catch((failure: unknown) =>
        setError(
          failure instanceof Error
            ? failure.message
            : '契約を読み込めませんでした。',
        ),
      )
      .finally(() => setLoading(false));
  }, [api, id]);
  const set = <K extends keyof ContractInput>(
    name: K,
    value: ContractInput[K],
  ) => setInput((current) => ({ ...current, [name]: value }));
  const nullableText = (
    name:
      | 'projectId'
      | 'proposalId'
      | 'engineerId'
      | 'paymentTerms'
      | 'notes'
      | 'changeSummary',
    value: string,
  ) => set(name, value.trim() === '' ? null : value);
  const number = (
    name:
      | 'monthlyAmount'
      | 'hourlyAmount'
      | 'settlementLowerHours'
      | 'settlementUpperHours',
    value: string,
  ) => set(name, value === '' ? null : Number(value));
  const updateParty = <K extends keyof ContractPartyInput>(
    index: number,
    name: K,
    value: ContractPartyInput[K],
  ) =>
    setInput((current) => ({
      ...current,
      parties: current.parties.map((party, partyIndex) =>
        partyIndex === index ? { ...party, [name]: value } : party,
      ),
    }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const contract = id
        ? await api.updateContract(id, rowVersion!, input)
        : await api.createContract(input);
      onSaved(contract.id);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : '契約を保存できませんでした。',
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <section className="content-panel" role="status">
        契約を読み込んでいます…
      </section>
    );
  return (
    <section className="content-panel">
      <div className="section-heading">
        <h2>{id ? '契約を編集' : '契約を登録'}</h2>
        <button className="secondary-button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <form className="project-form" onSubmit={(event) => void submit(event)}>
        <label>
          契約番号
          <input
            required
            maxLength={32}
            value={input.contractNo}
            onChange={(event) => set('contractNo', event.target.value)}
          />
        </label>
        <label>
          件名
          <input
            required
            maxLength={300}
            value={input.title}
            onChange={(event) => set('title', event.target.value)}
          />
        </label>
        <label>
          案件ID（提案IDを指定しない場合は必須）
          <input
            value={input.projectId ?? ''}
            onChange={(event) => nullableText('projectId', event.target.value)}
          />
        </label>
        <label>
          成約済み提案ID
          <input
            value={input.proposalId ?? ''}
            onChange={(event) => nullableText('proposalId', event.target.value)}
          />
        </label>
        <label>
          技術者ID
          <input
            value={input.engineerId ?? ''}
            onChange={(event) => nullableText('engineerId', event.target.value)}
          />
        </label>
        <label>
          契約形態
          <select
            value={input.contractType}
            onChange={(event) =>
              set('contractType', event.target.value as ContractType)
            }
          >
            {Object.entries(contractTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          開始日
          <input
            required
            type="date"
            value={input.startDate}
            onChange={(event) => set('startDate', event.target.value)}
          />
        </label>
        <label>
          終了日
          <input
            type="date"
            value={input.endDate ?? ''}
            onChange={(event) =>
              set(
                'endDate',
                event.target.value === '' ? null : event.target.value,
              )
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={input.autoRenew}
            onChange={(event) => set('autoRenew', event.target.checked)}
          />
          自動更新
        </label>
        <label>
          通貨
          <input
            required
            maxLength={3}
            value={input.currency}
            onChange={(event) =>
              set('currency', event.target.value.toUpperCase())
            }
          />
        </label>
        {(
          [
            ['monthlyAmount', '月額'],
            ['hourlyAmount', '時間単価'],
            ['settlementLowerHours', '精算下限時間'],
            ['settlementUpperHours', '精算上限時間'],
          ] as const
        ).map(([name, label]) => (
          <label key={name}>
            {label}
            <input
              type="number"
              min="0"
              step="0.01"
              value={input[name] ?? ''}
              onChange={(event) => number(name, event.target.value)}
            />
          </label>
        ))}
        <label>
          支払条件
          <textarea
            maxLength={1000}
            value={input.paymentTerms ?? ''}
            onChange={(event) =>
              nullableText('paymentTerms', event.target.value)
            }
          />
        </label>
        <label>
          備考
          <textarea
            maxLength={5000}
            value={input.notes ?? ''}
            onChange={(event) => nullableText('notes', event.target.value)}
          />
        </label>
        <fieldset>
          <legend>契約当事者（承認依頼前に1件以上必要）</legend>
          {input.parties.map((party, index) => (
            <div className="filter-row" key={index}>
              <label>
                会社ID
                <input
                  required
                  value={party.companyId}
                  onChange={(event) =>
                    updateParty(index, 'companyId', event.target.value)
                  }
                />
              </label>
              <label>
                担当者ID
                <input
                  value={party.contactId ?? ''}
                  onChange={(event) =>
                    updateParty(
                      index,
                      'contactId',
                      event.target.value === '' ? null : event.target.value,
                    )
                  }
                />
              </label>
              <label>
                役割
                <select
                  value={party.partyRole}
                  onChange={(event) =>
                    updateParty(
                      index,
                      'partyRole',
                      event.target.value as ContractPartyInput['partyRole'],
                    )
                  }
                >
                  <option value="customer">顧客</option>
                  <option value="supplier">仕入先</option>
                  <option value="employer">雇用元</option>
                  <option value="end_client">エンド顧客</option>
                  <option value="prime_contractor">元請</option>
                  <option value="subcontractor">下請</option>
                  <option value="other">その他</option>
                </select>
              </label>
              <label>
                請求役割
                <select
                  value={party.billingRole ?? ''}
                  onChange={(event) =>
                    updateParty(
                      index,
                      'billingRole',
                      (event.target.value ||
                        null) as ContractPartyInput['billingRole'],
                    )
                  }
                >
                  <option value="">なし</option>
                  <option value="bill_to">請求先</option>
                  <option value="pay_to">支払先</option>
                  <option value="none">対象外</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={party.isPrimary}
                  onChange={(event) =>
                    updateParty(index, 'isPrimary', event.target.checked)
                  }
                />
                主契約先
              </label>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setInput((current) => ({
                    ...current,
                    parties: current.parties.filter(
                      (_, partyIndex) => partyIndex !== index,
                    ),
                  }))
                }
              >
                削除
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary-button"
            disabled={input.parties.length >= 20}
            onClick={() =>
              setInput((current) => ({
                ...current,
                parties: [
                  ...current.parties,
                  {
                    companyId: '',
                    contactId: null,
                    partyRole: 'customer',
                    billingRole: 'bill_to',
                    isPrimary: current.parties.length === 0,
                  },
                ],
              }))
            }
          >
            契約当事者を追加
          </button>
        </fieldset>
        <label>
          変更概要
          <textarea
            maxLength={1000}
            value={input.changeSummary ?? ''}
            onChange={(event) =>
              nullableText('changeSummary', event.target.value)
            }
          />
        </label>
        <button className="primary-button" disabled={saving}>
          {saving ? '保存中…' : id ? '契約を保存' : '契約を登録'}
        </button>
      </form>
    </section>
  );
}

function InterviewListView({
  api,
  onOpen,
  onCreate,
  onUnauthorized,
}: {
  api: ProjectsApi;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onUnauthorized: () => Promise<void>;
}) {
  const [items, setItems] = useState<Interview[]>([]);
  const [status, setStatus] = useState<InterviewStatus | ''>('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    void api
      .listInterviews({
        ...(query ? { q: query } : {}),
        ...(status ? { status } : {}),
      })
      .then((result) => {
        setItems(result.items);
        setError('');
      })
      .catch((reason: unknown) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          void onUnauthorized();
        else
          setError(
            reason instanceof Error
              ? reason.message
              : '面談一覧を取得できませんでした。',
          );
      });
  }, [api, onUnauthorized, query, status]);
  return (
    <section className="content-panel">
      <div className="section-heading">
        <div>
          <h2>面談</h2>
          <p>RLSで参照可能な面談を表示します。</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          面談を登録
        </button>
      </div>
      <div className="filter-row">
        <input
          aria-label="提案番号で面談を検索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="提案番号"
        />
        <select
          aria-label="面談状態"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as InterviewStatus | '')
          }
        >
          <option value="">すべての状態</option>
          {Object.entries(interviewStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {error && <p role="alert">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>提案番号</th>
            <th>回数</th>
            <th>状態</th>
            <th>種別</th>
            <th>開始予定</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <button className="link-button" onClick={() => onOpen(item.id)}>
                  {item.proposalManagementNo}
                </button>
              </td>
              <td>{item.interviewRound}回目</td>
              <td>{interviewStatusLabels[item.status]}</td>
              <td>{interviewTypeLabels[item.interviewType]}</td>
              <td>{formatDateTime(item.scheduledStartAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && !error && <p>該当する面談はありません。</p>}
    </section>
  );
}

function InterviewDetail({
  api,
  id,
  onBack,
  onEdit,
  onResult,
  onUnauthorized,
}: {
  api: ProjectsApi;
  id: string;
  onBack: () => void;
  onEdit: () => void;
  onResult: () => void;
  onUnauthorized: () => Promise<void>;
}) {
  const [item, setItem] = useState<Interview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void api
      .getInterview(id)
      .then((result) => {
        setItem(result);
        setError('');
      })
      .catch((reason: unknown) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          void onUnauthorized();
        else
          setError(
            reason instanceof Error
              ? reason.message
              : '面談詳細を取得できませんでした。',
          );
      });
  }, [api, id, onUnauthorized]);
  if (error)
    return (
      <section className="content-panel">
        <p role="alert">{error}</p>
        <button className="secondary-button" onClick={onBack}>
          面談一覧へ戻る
        </button>
      </section>
    );
  if (!item)
    return (
      <section className="content-panel" role="status">
        面談を読み込んでいます…
      </section>
    );
  const meetingHref = item.meetingUrl?.startsWith('https://')
    ? item.meetingUrl
    : null;
  return (
    <section className="content-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{item.interviewRound}回目</p>
          <h2>{item.proposalManagementNo} の面談</h2>
        </div>
        <button className="secondary-button" onClick={onBack}>
          面談一覧へ戻る
        </button>
        {item.status === 'tentative' || item.status === 'scheduled' ? (
          <button className="primary-button" onClick={onEdit}>
            編集
          </button>
        ) : null}
        <button className="primary-button" onClick={onResult}>
          参加者・結果を登録
        </button>
      </div>
      <dl className="detail-grid">
        <dt>状態</dt>
        <dd>{interviewStatusLabels[item.status]}</dd>
        <dt>種別</dt>
        <dd>{interviewTypeLabels[item.interviewType]}</dd>
        <dt>開始予定</dt>
        <dd>{formatDateTime(item.scheduledStartAt)}</dd>
        <dt>終了予定</dt>
        <dd>{formatDateTime(item.scheduledEndAt)}</dd>
        <dt>会場</dt>
        <dd>{item.locationText ?? '未設定'}</dd>
        <dt>会議URL</dt>
        <dd>
          {meetingHref ? (
            <a href={meetingHref} target="_blank" rel="noreferrer">
              {item.meetingUrl}
            </a>
          ) : (
            (item.meetingUrl ?? '未設定')
          )}
        </dd>
        <dt>案件ポジションID</dt>
        <dd>{item.projectPositionId}</dd>
        <dt>技術者ID</dt>
        <dd>{item.engineerId}</dd>
        <dt>提案ID</dt>
        <dd>{item.proposalId}</dd>
        <dt>備考</dt>
        <dd>{item.notes ?? '未設定'}</dd>
        <dt>候補日時</dt>
        <dd>
          {item.scheduleCandidates.length === 0 ? (
            '未設定'
          ) : (
            <ol>
              {item.scheduleCandidates.map((candidate) => (
                <li key={candidate.id}>
                  {formatDateTime(candidate.startAt)} ～{' '}
                  {formatDateTime(candidate.endAt)}
                </li>
              ))}
            </ol>
          )}
        </dd>
        <dt>参加者</dt>
        <dd>
          {item.participants.length === 0 ? (
            '未登録'
          ) : (
            <ul>
              {item.participants.map((participant) => (
                <li key={participant.id}>
                  {participant.displayName ??
                    participant.engineerId ??
                    participant.userId ??
                    participant.companyContactId}
                  {' / '}
                  {participant.attendanceStatus}
                  {participant.roleLabel ? ` / ${participant.roleLabel}` : ''}
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt>面談結果</dt>
        <dd>
          {item.outcome ? (
            <>
              {item.outcome.outcome}
              {item.outcome.reason ? ` / ${item.outcome.reason}` : ''}
              {item.outcome.nextAction
                ? ` / 次の対応: ${item.outcome.nextAction}`
                : ''}
            </>
          ) : (
            '未登録'
          )}
        </dd>
        <dt>評価</dt>
        <dd>
          {item.feedback.length === 0 ? (
            '未登録'
          ) : (
            <ul>
              {item.feedback.map((feedback) => (
                <li key={feedback.id}>
                  総合 {feedback.overallRating ?? '-'} / 技術{' '}
                  {feedback.technicalRating ?? '-'} / コミュニケーション{' '}
                  {feedback.communicationRating ?? '-'}
                  {feedback.comments ? ` / ${feedback.comments}` : ''}
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt>状態履歴</dt>
        <dd>
          {item.statusHistory.length === 0 ? (
            '未登録'
          ) : (
            <ol>
              {item.statusHistory.map((history) => (
                <li key={history.id}>
                  {formatDateTime(history.changedAt)}:{' '}
                  {history.fromStatus ?? '作成'}
                  {' → '}
                  {history.toStatus}
                  {history.reason ? ` / ${history.reason}` : ''}
                </li>
              ))}
            </ol>
          )}
        </dd>
        <dt>版番号</dt>
        <dd>{item.rowVersion}</dd>
      </dl>
    </section>
  );
}

function InterviewForm({
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
  type CandidateDraft = { startAt: string; endAt: string };
  const empty: InterviewInput = {
    proposalId: '',
    interviewRound: 1,
    interviewType: 'online',
    status: 'tentative',
    scheduledStartAt: null,
    scheduledEndAt: null,
    locationText: null,
    meetingUrl: null,
    notes: null,
    scheduleCandidates: [],
  };
  const [input, setInput] = useState<InterviewInput>(empty);
  const [candidates, setCandidates] = useState<CandidateDraft[]>([]);
  const [rowVersion, setRowVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(id !== undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    void api
      .getInterview(id)
      .then((interview) => {
        setInput({
          proposalId: interview.proposalId,
          interviewRound: interview.interviewRound,
          interviewType: interview.interviewType,
          status: interview.status === 'scheduled' ? 'scheduled' : 'tentative',
          scheduledStartAt: interview.scheduledStartAt,
          scheduledEndAt: interview.scheduledEndAt,
          locationText: interview.locationText,
          meetingUrl: interview.meetingUrl,
          notes: interview.notes,
          scheduleCandidates: [],
        });
        setCandidates(
          interview.scheduleCandidates.map((candidate) => ({
            startAt: toDateTimeLocal(candidate.startAt),
            endAt: toDateTimeLocal(candidate.endAt),
          })),
        );
        setRowVersion(interview.rowVersion);
      })
      .catch((failure: unknown) =>
        setError(
          failure instanceof Error
            ? failure.message
            : '面談を読み込めませんでした。',
        ),
      )
      .finally(() => setLoading(false));
  }, [api, id]);
  const update = <K extends keyof InterviewInput>(
    name: K,
    value: InterviewInput[K],
  ) => setInput((current) => ({ ...current, [name]: value }));
  const updateCandidate = (
    index: number,
    name: keyof CandidateDraft,
    value: string,
  ) =>
    setCandidates((current) =>
      current.map((candidate, candidateIndex) =>
        candidateIndex === index ? { ...candidate, [name]: value } : candidate,
      ),
    );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload: InterviewInput = {
      ...input,
      scheduledStartAt: input.scheduledStartAt
        ? new Date(input.scheduledStartAt).toISOString()
        : null,
      scheduledEndAt: input.scheduledEndAt
        ? new Date(input.scheduledEndAt).toISOString()
        : null,
      scheduleCandidates: candidates.map((candidate) => ({
        startAt: new Date(candidate.startAt).toISOString(),
        endAt: new Date(candidate.endAt).toISOString(),
      })),
    };
    try {
      const interview = id
        ? await api.updateInterview(id, rowVersion!, payload)
        : await api.createInterview(payload);
      onSaved(interview.id);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : '面談を保存できませんでした。',
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <section className="content-panel" role="status">
        面談を読み込んでいます…
      </section>
    );
  return (
    <section className="content-panel">
      <div className="section-heading">
        <h2>{id ? '面談を編集' : '面談を登録'}</h2>
        <button className="secondary-button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <form className="project-form" onSubmit={(event) => void submit(event)}>
        <label>
          提案ID
          <input
            required
            disabled={id !== undefined}
            value={input.proposalId}
            onChange={(event) => update('proposalId', event.target.value)}
          />
        </label>
        <label>
          面談回数
          <input
            required
            type="number"
            min={1}
            max={99}
            value={input.interviewRound}
            onChange={(event) =>
              update('interviewRound', Number(event.target.value))
            }
          />
        </label>
        <label>
          種別
          <select
            value={input.interviewType}
            onChange={(event) =>
              update('interviewType', event.target.value as InterviewType)
            }
          >
            {Object.entries(interviewTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          状態
          <select
            value={input.status}
            onChange={(event) =>
              update('status', event.target.value as InterviewInput['status'])
            }
          >
            <option value="tentative">日程調整中</option>
            <option value="scheduled">予定確定</option>
          </select>
        </label>
        <label>
          確定開始日時
          <input
            type="datetime-local"
            required={input.status === 'scheduled'}
            value={toDateTimeLocal(input.scheduledStartAt)}
            onChange={(event) =>
              update('scheduledStartAt', event.target.value || null)
            }
          />
        </label>
        <label>
          確定終了日時
          <input
            type="datetime-local"
            required={input.status === 'scheduled'}
            value={toDateTimeLocal(input.scheduledEndAt)}
            onChange={(event) =>
              update('scheduledEndAt', event.target.value || null)
            }
          />
        </label>
        <label>
          会場
          <input
            maxLength={500}
            value={input.locationText ?? ''}
            onChange={(event) =>
              update('locationText', event.target.value || null)
            }
          />
        </label>
        <label>
          会議URL
          <input
            type="url"
            maxLength={2000}
            value={input.meetingUrl ?? ''}
            onChange={(event) =>
              update('meetingUrl', event.target.value || null)
            }
          />
        </label>
        <label>
          備考
          <textarea
            maxLength={5000}
            value={input.notes ?? ''}
            onChange={(event) => update('notes', event.target.value || null)}
          />
        </label>
        <fieldset>
          <legend>候補日時（最大10件）</legend>
          {candidates.map((candidate, index) => (
            <div className="filter-row" key={index}>
              <label>
                候補{index + 1}開始
                <input
                  required
                  type="datetime-local"
                  value={candidate.startAt}
                  onChange={(event) =>
                    updateCandidate(index, 'startAt', event.target.value)
                  }
                />
              </label>
              <label>
                候補{index + 1}終了
                <input
                  required
                  type="datetime-local"
                  value={candidate.endAt}
                  onChange={(event) =>
                    updateCandidate(index, 'endAt', event.target.value)
                  }
                />
              </label>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setCandidates((current) =>
                    current.filter(
                      (_, candidateIndex) => candidateIndex !== index,
                    ),
                  )
                }
              >
                削除
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary-button"
            disabled={candidates.length >= 10}
            onClick={() =>
              setCandidates((current) => [
                ...current,
                { startAt: '', endAt: '' },
              ])
            }
          >
            候補日時を追加
          </button>
        </fieldset>
        <button className="primary-button" disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
      </form>
    </section>
  );
}

function InterviewResultForm({
  api,
  id,
  onCancel,
  onSaved,
}: {
  api: ProjectsApi;
  id: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const emptyParticipant = (): InterviewParticipantInput => ({
    participantType: 'other',
    engineerId: null,
    userId: null,
    companyContactId: null,
    displayName: null,
    email: null,
    roleLabel: null,
    attendanceStatus: 'attended',
  });
  const [rowVersion, setRowVersion] = useState<number | null>(null);
  const [status, setStatus] =
    useState<InterviewResultInput['status']>('completed');
  const [reason, setReason] = useState('');
  const [participants, setParticipants] = useState<InterviewParticipantInput[]>(
    [],
  );
  const [outcome, setOutcome] = useState<
    NonNullable<InterviewResultInput['outcome']>
  >({
    outcome: 'pending',
    decidedAt: null,
    decisionSource: 'customer',
    reason: null,
    nextAction: null,
    nextActionDueAt: null,
  });
  const [feedback, setFeedback] = useState<
    NonNullable<InterviewResultInput['feedback']>
  >({
    evaluationType: 'internal',
    overallRating: null,
    technicalRating: null,
    communicationRating: null,
    recommendation: null,
    comments: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void api
      .getInterview(id)
      .then((interview) => {
        setRowVersion(interview.rowVersion);
        if (
          interview.status === 'completed' ||
          interview.status === 'cancelled' ||
          interview.status === 'no_show'
        )
          setStatus(interview.status);
        setParticipants(
          interview.participants.map((participant) => ({
            participantType: participant.participantType,
            engineerId: participant.engineerId,
            userId: participant.userId,
            companyContactId: participant.companyContactId,
            displayName: participant.displayName,
            email: participant.email,
            roleLabel: participant.roleLabel,
            attendanceStatus: participant.attendanceStatus,
          })),
        );
        const internalFeedback = interview.feedback.find(
          (item) => item.evaluationType === 'internal',
        );
        if (internalFeedback)
          setFeedback({
            evaluationType: 'internal',
            overallRating: internalFeedback.overallRating,
            technicalRating: internalFeedback.technicalRating,
            communicationRating: internalFeedback.communicationRating,
            recommendation: internalFeedback.recommendation,
            comments: internalFeedback.comments,
          });
        if (interview.outcome)
          setOutcome({
            outcome: interview.outcome.outcome,
            decidedAt: interview.outcome.decidedAt,
            decisionSource: interview.outcome.decisionSource ?? 'customer',
            reason: interview.outcome.reason,
            nextAction: interview.outcome.nextAction,
            nextActionDueAt: interview.outcome.nextActionDueAt,
          });
      })
      .catch((failure: unknown) =>
        setError(
          failure instanceof Error
            ? failure.message
            : '面談結果を読み込めませんでした。',
        ),
      )
      .finally(() => setLoading(false));
  }, [api, id]);
  const updateParticipant = <K extends keyof InterviewParticipantInput>(
    index: number,
    name: K,
    value: InterviewParticipantInput[K],
  ) =>
    setParticipants((current) =>
      current.map((participant, participantIndex) =>
        participantIndex === index
          ? name === 'participantType'
            ? {
                ...emptyParticipant(),
                participantType:
                  value as InterviewParticipantInput['participantType'],
              }
            : { ...participant, [name]: value }
          : participant,
      ),
    );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const hasFeedback =
      feedback.overallRating !== null ||
      feedback.technicalRating !== null ||
      feedback.communicationRating !== null ||
      feedback.recommendation !== null ||
      Boolean(feedback.comments);
    try {
      await api.saveInterviewResult(id, rowVersion!, {
        status,
        reason: reason.trim() || null,
        participants,
        feedback: hasFeedback ? feedback : null,
        outcome:
          status === 'completed'
            ? {
                ...outcome,
                decidedAt: outcome.decidedAt
                  ? new Date(outcome.decidedAt).toISOString()
                  : null,
                nextActionDueAt: outcome.nextActionDueAt
                  ? new Date(outcome.nextActionDueAt).toISOString()
                  : null,
              }
            : null,
      });
      onSaved();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : '面談参加者・結果を保存できませんでした。',
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <section className="content-panel" role="status">
        面談結果を読み込んでいます…
      </section>
    );
  const suggestedProposalStatus = {
    pass: 'オファー',
    fail: '失注',
    hold: '面談中を維持',
    withdrawn: '辞退',
    pending: '面談中を維持',
  }[outcome.outcome];
  return (
    <section className="content-panel">
      <div className="section-heading">
        <h2>面談参加者・結果</h2>
        <button className="secondary-button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <form className="project-form" onSubmit={(event) => void submit(event)}>
        <label>
          面談状態
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as InterviewResultInput['status'])
            }
          >
            <option value="completed">実施済み</option>
            <option value="cancelled">キャンセル</option>
            <option value="no_show">不参加</option>
          </select>
        </label>
        <label>
          状態変更理由
          <textarea
            required={status !== 'completed'}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <fieldset>
          <legend>参加者（最大50件）</legend>
          {participants.map((participant, index) => (
            <div className="filter-row" key={index}>
              <label>
                参加者{index + 1}種別
                <select
                  value={participant.participantType}
                  onChange={(event) =>
                    updateParticipant(
                      index,
                      'participantType',
                      event.target
                        .value as InterviewParticipantInput['participantType'],
                    )
                  }
                >
                  <option value="engineer">技術者</option>
                  <option value="user">社内利用者</option>
                  <option value="company_contact">会社担当者</option>
                  <option value="other">その他</option>
                </select>
              </label>
              {participant.participantType === 'engineer' ? (
                <label>
                  技術者ID
                  <input
                    required
                    value={participant.engineerId ?? ''}
                    onChange={(event) =>
                      updateParticipant(
                        index,
                        'engineerId',
                        event.target.value || null,
                      )
                    }
                  />
                </label>
              ) : participant.participantType === 'user' ? (
                <label>
                  利用者ID
                  <input
                    required
                    value={participant.userId ?? ''}
                    onChange={(event) =>
                      updateParticipant(
                        index,
                        'userId',
                        event.target.value || null,
                      )
                    }
                  />
                </label>
              ) : participant.participantType === 'company_contact' ? (
                <label>
                  会社担当者ID
                  <input
                    required
                    value={participant.companyContactId ?? ''}
                    onChange={(event) =>
                      updateParticipant(
                        index,
                        'companyContactId',
                        event.target.value || null,
                      )
                    }
                  />
                </label>
              ) : (
                <label>
                  表示名
                  <input
                    required
                    maxLength={200}
                    value={participant.displayName ?? ''}
                    onChange={(event) =>
                      updateParticipant(
                        index,
                        'displayName',
                        event.target.value || null,
                      )
                    }
                  />
                </label>
              )}
              <label>
                メール
                <input
                  type="email"
                  maxLength={320}
                  value={participant.email ?? ''}
                  onChange={(event) =>
                    updateParticipant(
                      index,
                      'email',
                      event.target.value || null,
                    )
                  }
                />
              </label>
              <label>
                役割
                <input
                  maxLength={200}
                  value={participant.roleLabel ?? ''}
                  onChange={(event) =>
                    updateParticipant(
                      index,
                      'roleLabel',
                      event.target.value || null,
                    )
                  }
                />
              </label>
              <label>
                出席状況
                <select
                  value={participant.attendanceStatus}
                  onChange={(event) =>
                    updateParticipant(
                      index,
                      'attendanceStatus',
                      event.target
                        .value as InterviewParticipantInput['attendanceStatus'],
                    )
                  }
                >
                  <option value="expected">予定</option>
                  <option value="accepted">承諾</option>
                  <option value="declined">辞退</option>
                  <option value="attended">出席</option>
                  <option value="absent">欠席</option>
                </select>
              </label>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setParticipants((current) =>
                    current.filter(
                      (_, participantIndex) => participantIndex !== index,
                    ),
                  )
                }
              >
                削除
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary-button"
            disabled={participants.length >= 50}
            onClick={() =>
              setParticipants((current) => [...current, emptyParticipant()])
            }
          >
            参加者を追加
          </button>
        </fieldset>
        {status === 'completed' ? (
          <>
            <fieldset>
              <legend>結果</legend>
              <label>
                判定
                <select
                  value={outcome.outcome}
                  onChange={(event) =>
                    setOutcome((current) => ({
                      ...current,
                      outcome: event.target.value as typeof current.outcome,
                    }))
                  }
                >
                  <option value="pass">通過</option>
                  <option value="fail">見送り</option>
                  <option value="hold">保留</option>
                  <option value="withdrawn">辞退</option>
                  <option value="pending">回答待ち</option>
                </select>
              </label>
              <p>提案状態候補: {suggestedProposalStatus}（自動反映しません）</p>
              <label>
                決定元
                <select
                  value={outcome.decisionSource}
                  onChange={(event) =>
                    setOutcome((current) => ({
                      ...current,
                      decisionSource: event.target
                        .value as typeof current.decisionSource,
                    }))
                  }
                >
                  <option value="customer">顧客</option>
                  <option value="internal">社内</option>
                  <option value="engineer">技術者</option>
                  <option value="system">システム</option>
                </select>
              </label>
              <label>
                決定日時
                <input
                  type="datetime-local"
                  required={outcome.outcome !== 'pending'}
                  value={toDateTimeLocal(outcome.decidedAt)}
                  onChange={(event) =>
                    setOutcome((current) => ({
                      ...current,
                      decidedAt: event.target.value || null,
                    }))
                  }
                />
              </label>
              <label>
                結果理由
                <textarea
                  maxLength={2000}
                  value={outcome.reason ?? ''}
                  onChange={(event) =>
                    setOutcome((current) => ({
                      ...current,
                      reason: event.target.value || null,
                    }))
                  }
                />
              </label>
              <label>
                次の対応
                <textarea
                  maxLength={2000}
                  value={outcome.nextAction ?? ''}
                  onChange={(event) =>
                    setOutcome((current) => ({
                      ...current,
                      nextAction: event.target.value || null,
                    }))
                  }
                />
              </label>
              <label>
                次の対応期限
                <input
                  type="datetime-local"
                  value={toDateTimeLocal(outcome.nextActionDueAt)}
                  onChange={(event) =>
                    setOutcome((current) => ({
                      ...current,
                      nextActionDueAt: event.target.value || null,
                    }))
                  }
                />
              </label>
            </fieldset>
            <fieldset>
              <legend>社内評価（任意）</legend>
              {(
                [
                  ['overallRating', '総合評価'],
                  ['technicalRating', '技術評価'],
                  ['communicationRating', 'コミュニケーション評価'],
                ] as const
              ).map(([name, label]) => (
                <label key={name}>
                  {label}
                  <select
                    value={feedback[name] ?? ''}
                    onChange={(event) =>
                      setFeedback((current) => ({
                        ...current,
                        [name]: event.target.value
                          ? Number(event.target.value)
                          : null,
                      }))
                    }
                  >
                    <option value="">未評価</option>
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <option key={rating} value={rating}>
                        {rating}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label>
                推奨
                <select
                  value={feedback.recommendation ?? ''}
                  onChange={(event) =>
                    setFeedback((current) => ({
                      ...current,
                      recommendation:
                        (event.target.value as typeof current.recommendation) ||
                        null,
                    }))
                  }
                >
                  <option value="">未評価</option>
                  <option value="strong_yes">強く推奨</option>
                  <option value="yes">推奨</option>
                  <option value="hold">保留</option>
                  <option value="no">非推奨</option>
                  <option value="strong_no">強く非推奨</option>
                </select>
              </label>
              <label>
                評価コメント
                <textarea
                  maxLength={5000}
                  value={feedback.comments ?? ''}
                  onChange={(event) =>
                    setFeedback((current) => ({
                      ...current,
                      comments: event.target.value || null,
                    }))
                  }
                />
              </label>
            </fieldset>
          </>
        ) : null}
        <button className="primary-button" disabled={saving}>
          {saving ? '保存中…' : '参加者・結果を保存'}
        </button>
      </form>
    </section>
  );
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function ProposalListView({
  api,
  onOpen,
  onCreate,
  onUnauthorized,
}: {
  api: ProjectsApi;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onUnauthorized: () => Promise<void>;
}) {
  const [items, setItems] = useState<Proposal[]>([]);
  const [status, setStatus] = useState<ProposalStatus | ''>('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    void api
      .listProposals({
        ...(query ? { q: query } : {}),
        ...(status ? { status } : {}),
      })
      .then((result) => {
        setItems(result.items);
        setError('');
      })
      .catch((reason: unknown) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          void onUnauthorized();
        else
          setError(
            reason instanceof Error
              ? reason.message
              : '提案一覧を取得できませんでした。',
          );
      });
  }, [api, onUnauthorized, query, status]);
  return (
    <section className="content-panel">
      <div className="section-heading">
        <div>
          <h2>提案</h2>
          <p>RLSで参照可能な提案を表示します。</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          提案を登録
        </button>
      </div>
      <div className="filter-row">
        <input
          aria-label="提案番号で検索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="提案番号"
        />
        <select
          aria-label="提案状態"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as ProposalStatus | '')
          }
        >
          <option value="">すべての状態</option>
          {Object.entries(proposalStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {error && <p role="alert">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>提案番号</th>
            <th>状態</th>
            <th>単価</th>
            <th>開始日</th>
            <th>有効期限</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} onClick={() => onOpen(item.id)}>
              <td>
                <button className="link-button">{item.managementNo}</button>
              </td>
              <td>{proposalStatusLabels[item.status]}</td>
              <td>
                {item.proposedUnitPrice === null
                  ? '—'
                  : `${item.proposedUnitPrice.toLocaleString()} ${item.currencyCode}`}
              </td>
              <td>{item.proposedStartDate ?? '—'}</td>
              <td>{item.validityDate ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && !error && <p>該当する提案はありません。</p>}
    </section>
  );
}

function ProposalDetail({
  api,
  id,
  onBack,
  onEdit,
  onUnauthorized,
}: {
  api: ProjectsApi;
  id: string;
  onBack: () => void;
  onEdit: () => void;
  onUnauthorized: () => Promise<void>;
}) {
  const [item, setItem] = useState<Proposal | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [nextStatus, setNextStatus] = useState<ProposalStatus | ''>('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [winResult, setWinResult] = useState<ProposalWinResult | null>(null);
  useEffect(() => {
    void api
      .getProposal(id)
      .then(setItem)
      .catch((reason: unknown) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          void onUnauthorized();
        else
          setError(
            reason instanceof Error
              ? reason.message
              : '提案詳細を取得できませんでした。',
          );
      });
  }, [api, id, onUnauthorized]);
  async function transition(event: FormEvent) {
    event.preventDefault();
    if (!item || !nextStatus) return;
    setSaving(true);
    setActionError('');
    setWinResult(null);
    try {
      const won =
        nextStatus === 'won'
          ? await api.winProposal(item.id, item.rowVersion)
          : null;
      const updated =
        won?.proposal ??
        (await api.transitionProposalStatus(item.id, item.rowVersion, {
          status: nextStatus,
          reason: reason.trim() || null,
        }));
      setItem(updated);
      setWinResult(won);
      setNextStatus('');
      setReason('');
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.status === 401)
        await onUnauthorized();
      else
        setActionError(
          failure instanceof Error
            ? failure.message
            : '提案状態を更新できませんでした。',
        );
    } finally {
      setSaving(false);
    }
  }
  if (error)
    return (
      <section className="content-panel">
        <p role="alert">{error}</p>
        <button onClick={onBack}>一覧へ戻る</button>
      </section>
    );
  if (!item)
    return (
      <section className="content-panel" role="status">
        提案を読み込んでいます…
      </section>
    );
  return (
    <section className="content-panel">
      <button className="secondary-button" onClick={onBack}>
        一覧へ戻る
      </button>
      <div className="section-heading">
        <h2>{item.managementNo}</h2>
        {item.status === 'draft' ? (
          <button className="primary-button" onClick={onEdit}>
            編集
          </button>
        ) : null}
      </div>
      <dl className="detail-grid">
        <dt>状態</dt>
        <dd>{proposalStatusLabels[item.status]}</dd>
        <dt>案件ポジションID</dt>
        <dd>{item.projectPositionId}</dd>
        <dt>技術者ID</dt>
        <dd>{item.engineerId}</dd>
        <dt>提出先会社ID</dt>
        <dd>{item.destinationCompanyId}</dd>
        <dt>提出先担当者ID</dt>
        <dd>{item.destinationContactId ?? '—'}</dd>
        <dt>提案単価</dt>
        <dd>
          {item.proposedUnitPrice === null
            ? '—'
            : `${item.proposedUnitPrice.toLocaleString()} ${item.currencyCode}`}
        </dd>
        <dt>提案開始日</dt>
        <dd>{item.proposedStartDate ?? '—'}</dd>
        <dt>有効期限</dt>
        <dd>{item.validityDate ?? '—'}</dd>
        <dt>経歴書版ID</dt>
        <dd>{item.resumeVersionId ?? '—'}</dd>
        <dt>要件版ID</dt>
        <dd>{item.requirementVersionId ?? '—'}</dd>
      </dl>
      {winResult ? (
        <p role="status">
          成約を登録し、契約・参画の下書きを生成しました。{' '}
          <a href={`/contracts/${winResult.contractId}`}>契約下書きを確認</a>
          <br />
          {' / '}
          <a href={`/engagements/${winResult.engagementId}`}>
            参画下書きを確認
          </a>
        </p>
      ) : null}
      {proposalTransitions[item.status].length > 0 ? (
        <form
          className="project-form"
          onSubmit={(event) => void transition(event)}
        >
          <h3>状態を更新</h3>
          {actionError ? <p role="alert">{actionError}</p> : null}
          <label>
            次の状態
            <select
              required
              value={nextStatus}
              onChange={(event) =>
                setNextStatus(event.target.value as ProposalStatus | '')
              }
            >
              <option value="">選択してください</option>
              {proposalTransitions[item.status].map((status) => (
                <option key={status} value={status}>
                  {proposalStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            変更理由
            <textarea
              maxLength={500}
              required={
                nextStatus === 'lost' ||
                nextStatus === 'withdrawn' ||
                nextStatus === 'cancelled'
              }
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={saving || !nextStatus}>
            {saving ? '更新中…' : '状態を更新'}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function ProposalForm({
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
  const empty: ProposalInput = {
    managementNo: '',
    projectPositionId: '',
    engineerId: '',
    destinationCompanyId: '',
    destinationContactId: null,
    resumeVersionId: null,
    requirementVersionId: null,
    proposedUnitPrice: null,
    currencyCode: 'JPY',
    proposedStartDate: null,
    validityDate: null,
  };
  const [input, setInput] = useState<ProposalInput>(empty);
  const [rowVersion, setRowVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(id !== undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    void api
      .getProposal(id)
      .then((proposal) => {
        setInput({
          managementNo: proposal.managementNo,
          projectPositionId: proposal.projectPositionId,
          engineerId: proposal.engineerId,
          destinationCompanyId: proposal.destinationCompanyId,
          destinationContactId: proposal.destinationContactId,
          resumeVersionId: proposal.resumeVersionId,
          requirementVersionId: proposal.requirementVersionId,
          proposedUnitPrice: proposal.proposedUnitPrice,
          currencyCode: proposal.currencyCode,
          proposedStartDate: proposal.proposedStartDate,
          validityDate: proposal.validityDate,
        });
        setRowVersion(proposal.rowVersion);
      })
      .catch((failure: unknown) =>
        setError(
          failure instanceof Error
            ? failure.message
            : '提案を読み込めませんでした。',
        ),
      )
      .finally(() => setLoading(false));
  }, [api, id]);
  const text = (name: keyof ProposalInput, value: string) =>
    setInput((current) => ({ ...current, [name]: value }));
  const nullable = (name: keyof ProposalInput, value: string) =>
    setInput((current) => ({
      ...current,
      [name]: value.trim() === '' ? null : value,
    }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const proposal = id
        ? await api.updateProposal(id, rowVersion!, input)
        : await api.createProposal(input);
      onSaved(proposal.id);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : '提案を保存できませんでした。',
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <section className="content-panel" role="status">
        提案を読み込んでいます…
      </section>
    );
  return (
    <section className="content-panel">
      <div className="section-heading">
        <h2>{id ? '提案を編集' : '提案を登録'}</h2>
        <button className="secondary-button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <form className="project-form" onSubmit={(event) => void submit(event)}>
        <label>
          提案番号
          <input
            required
            maxLength={32}
            value={input.managementNo}
            onChange={(event) => text('managementNo', event.target.value)}
          />
        </label>
        <label>
          案件ポジションID
          <input
            required
            value={input.projectPositionId}
            onChange={(event) => text('projectPositionId', event.target.value)}
          />
        </label>
        <label>
          技術者ID
          <input
            required
            value={input.engineerId}
            onChange={(event) => text('engineerId', event.target.value)}
          />
        </label>
        <label>
          提出先会社ID
          <input
            required
            value={input.destinationCompanyId}
            onChange={(event) =>
              text('destinationCompanyId', event.target.value)
            }
          />
        </label>
        <label>
          提出先担当者ID
          <input
            value={input.destinationContactId ?? ''}
            onChange={(event) =>
              nullable('destinationContactId', event.target.value)
            }
          />
        </label>
        <label>
          経歴書版ID
          <input
            value={input.resumeVersionId ?? ''}
            onChange={(event) =>
              nullable('resumeVersionId', event.target.value)
            }
          />
        </label>
        <label>
          案件要件版ID
          <input
            value={input.requirementVersionId ?? ''}
            onChange={(event) =>
              nullable('requirementVersionId', event.target.value)
            }
          />
        </label>
        <label>
          提案単価
          <input
            type="number"
            min="0"
            step="0.01"
            value={input.proposedUnitPrice ?? ''}
            onChange={(event) =>
              setInput((current) => ({
                ...current,
                proposedUnitPrice:
                  event.target.value === '' ? null : Number(event.target.value),
              }))
            }
          />
        </label>
        <label>
          通貨
          <input
            required
            maxLength={3}
            value={input.currencyCode}
            onChange={(event) =>
              text('currencyCode', event.target.value.toUpperCase())
            }
          />
        </label>
        <label>
          提案開始日
          <input
            type="date"
            value={input.proposedStartDate ?? ''}
            onChange={(event) =>
              nullable('proposedStartDate', event.target.value)
            }
          />
        </label>
        <label>
          有効期限
          <input
            type="date"
            value={input.validityDate ?? ''}
            onChange={(event) => nullable('validityDate', event.target.value)}
          />
        </label>
        <button className="primary-button" disabled={saving}>
          {saving ? '保存中…' : id ? '提案を保存' : '提案を登録'}
        </button>
      </form>
    </section>
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
          onClick={() => navigate('/invoices')}
        >
          請求
        </button>
        <button
          className="secondary-button"
          onClick={() => navigate('/work-logs')}
        >
          月次実績
        </button>
        <button
          className="secondary-button"
          onClick={() => navigate('/engagements')}
        >
          参画
        </button>
        <button
          className="secondary-button"
          onClick={() => navigate('/contracts')}
        >
          契約
        </button>
        <button
          className="secondary-button"
          onClick={() => navigate('/interviews')}
        >
          面談
        </button>
        <button
          className="secondary-button"
          onClick={() => navigate('/proposals')}
        >
          提案
        </button>
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
        <button
          className="secondary-button"
          onClick={() => navigate('/contacts')}
        >
          担当者
        </button>
        <button
          className="secondary-button"
          onClick={() => navigate('/engineers')}
        >
          技術者
        </button>
      </nav>
      {route.page === 'invoices' ? (
        <InvoiceListView
          api={api}
          onOpen={(id) => navigate(`/invoices/${id}`)}
          onUnauthorized={signOut}
        />
      ) : route.page === 'invoice-detail' ? (
        <InvoiceDetailView
          api={api}
          id={route.id}
          onBack={() => navigate('/invoices')}
          onOpenContract={(id) => navigate(`/contracts/${id}`)}
          onUnauthorized={signOut}
        />
      ) : route.page === 'work-logs' ? (
        <WorkLogListView
          api={api}
          onOpen={(id) => navigate(`/work-logs/${id}`)}
          onCreate={() => navigate('/work-logs/new')}
          onUnauthorized={signOut}
        />
      ) : route.page === 'work-log-detail' ? (
        <WorkLogDetail
          api={api}
          id={route.id}
          onBack={() => navigate('/work-logs')}
          onOpenContract={(id) => navigate(`/contracts/${id}`)}
          onEdit={() => navigate(`/work-logs/${route.id}/edit`)}
          onUnauthorized={signOut}
        />
      ) : route.page === 'work-log-new' || route.page === 'work-log-edit' ? (
        <WorkLogForm
          api={api}
          {...(route.page === 'work-log-edit' ? { id: route.id } : {})}
          onCancel={() =>
            navigate(
              route.page === 'work-log-edit'
                ? `/work-logs/${route.id}`
                : '/work-logs',
            )
          }
          onSaved={(id) => navigate(`/work-logs/${id}`)}
        />
      ) : route.page === 'engagements' ? (
        <EngagementListView
          api={api}
          onOpen={(id) => navigate(`/engagements/${id}`)}
          onCreate={() => navigate('/engagements/new')}
          onUnauthorized={signOut}
        />
      ) : route.page === 'engagement-detail' ? (
        <EngagementDetail
          api={api}
          id={route.id}
          onBack={() => navigate('/engagements')}
          onOpenContract={(id) => navigate(`/contracts/${id}`)}
          onEdit={() => navigate(`/engagements/${route.id}/edit`)}
          onUnauthorized={signOut}
        />
      ) : route.page === 'engagement-new' ||
        route.page === 'engagement-edit' ? (
        <EngagementForm
          api={api}
          {...(route.page === 'engagement-edit' ? { id: route.id } : {})}
          onCancel={() =>
            navigate(
              route.page === 'engagement-edit'
                ? `/engagements/${route.id}`
                : '/engagements',
            )
          }
          onSaved={(id) => navigate(`/engagements/${id}`)}
        />
      ) : route.page === 'contracts' ? (
        <ContractListView
          api={api}
          onOpen={(id) => navigate(`/contracts/${id}`)}
          onCreate={() => navigate('/contracts/new')}
          onUnauthorized={signOut}
        />
      ) : route.page === 'contract-detail' ? (
        <ContractDetail
          api={api}
          id={route.id}
          onBack={() => navigate('/contracts')}
          onEdit={() => navigate(`/contracts/${route.id}/edit`)}
          onUnauthorized={signOut}
        />
      ) : route.page === 'contract-new' || route.page === 'contract-edit' ? (
        <ContractForm
          api={api}
          {...(route.page === 'contract-edit' ? { id: route.id } : {})}
          onCancel={() =>
            navigate(
              route.page === 'contract-edit'
                ? `/contracts/${route.id}`
                : '/contracts',
            )
          }
          onSaved={(id) => navigate(`/contracts/${id}`)}
        />
      ) : route.page === 'interviews' ? (
        <InterviewListView
          api={api}
          onOpen={(id) => navigate(`/interviews/${id}`)}
          onCreate={() => navigate('/interviews/new')}
          onUnauthorized={signOut}
        />
      ) : route.page === 'interview-detail' ? (
        <InterviewDetail
          api={api}
          id={route.id}
          onBack={() => navigate('/interviews')}
          onEdit={() => navigate(`/interviews/${route.id}/edit`)}
          onResult={() => navigate(`/interviews/${route.id}/result`)}
          onUnauthorized={signOut}
        />
      ) : route.page === 'interview-result' ? (
        <InterviewResultForm
          api={api}
          id={route.id}
          onCancel={() => navigate(`/interviews/${route.id}`)}
          onSaved={() => navigate(`/interviews/${route.id}`)}
        />
      ) : route.page === 'interview-new' || route.page === 'interview-edit' ? (
        <InterviewForm
          api={api}
          {...(route.page === 'interview-edit' ? { id: route.id } : {})}
          onCancel={() =>
            navigate(
              route.page === 'interview-edit'
                ? `/interviews/${route.id}`
                : '/interviews',
            )
          }
          onSaved={(id) => navigate(`/interviews/${id}`)}
        />
      ) : route.page === 'proposals' ? (
        <ProposalListView
          api={api}
          onOpen={(id) => navigate(`/proposals/${id}`)}
          onCreate={() => navigate('/proposals/new')}
          onUnauthorized={signOut}
        />
      ) : route.page === 'proposal-detail' ? (
        <ProposalDetail
          api={api}
          id={route.id}
          onBack={() => navigate('/proposals')}
          onEdit={() => navigate(`/proposals/${route.id}/edit`)}
          onUnauthorized={signOut}
        />
      ) : route.page === 'proposal-new' || route.page === 'proposal-edit' ? (
        <ProposalForm
          api={api}
          {...(route.page === 'proposal-edit' ? { id: route.id } : {})}
          onCancel={() =>
            navigate(
              route.page === 'proposal-edit'
                ? `/proposals/${route.id}`
                : '/proposals',
            )
          }
          onSaved={(id) => navigate(`/proposals/${id}`)}
        />
      ) : route.page === 'list' ? (
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
      ) : route.page === 'contacts' ? (
        <ContactList
          api={api}
          onOpen={(id) => navigate(`/contacts/${id}`)}
          onUnauthorized={signOut}
        />
      ) : route.page === 'engineers' ? (
        <EngineerList
          api={api}
          onOpen={(id) => navigate(`/engineers/${id}`)}
          onUnauthorized={signOut}
          onCreate={() => navigate('/engineers/new')}
        />
      ) : route.page === 'engineer-detail' ? (
        <EngineerDetail
          api={api}
          id={route.id}
          onBack={() => navigate('/engineers')}
          onUnauthorized={signOut}
          onEdit={() => navigate(`/engineers/${route.id}/edit`)}
          onDeleted={() => navigate('/engineers')}
        />
      ) : route.page === 'engineer-new' || route.page === 'engineer-edit' ? (
        <EngineerForm
          api={api}
          {...(route.page === 'engineer-edit' ? { id: route.id } : {})}
          onCancel={() =>
            navigate(
              route.page === 'engineer-edit'
                ? `/engineers/${route.id}`
                : '/engineers',
            )
          }
          onSaved={(id) => navigate(`/engineers/${id}`)}
        />
      ) : route.page === 'contact-detail' ? (
        <ContactDetail
          api={api}
          id={route.id}
          onBack={() => navigate('/contacts')}
          onUnauthorized={signOut}
        />
      ) : route.page === 'company-detail' ? (
        <CompanyDetail
          api={api}
          id={route.id}
          onBack={() => navigate('/companies')}
          onUnauthorized={signOut}
          onEdit={() => navigate(`/companies/${route.id}/edit`)}
          onDeleted={() => navigate('/companies')}
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

const engineerStatusLabels: Record<EngineerStatus, string> = {
  candidate: '候補',
  active: '稼働対象',
  inactive: '休止',
  retired: '退職',
  blocked: '利用停止',
};
const availabilityLabels: Record<AvailabilityStatus, string> = {
  unknown: '不明',
  available: '提案可能',
  proposed: '提案中',
  engaged: '参画中',
  unavailable: '提案不可',
};
function EngineerList({
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
  const [items, setItems] = useState<Engineer[] | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<EngineerStatus | ''>('');
  const [availabilityStatus, setAvailabilityStatus] = useState<
    AvailabilityStatus | ''
  >('');
  const [filters, setFilters] = useState({
    q: '',
    status: '' as EngineerStatus | '',
    availabilityStatus: '' as AvailabilityStatus | '',
  });
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setItems(null);
    setError(false);
    api
      .listEngineers({
        limit: 50,
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.availabilityStatus
          ? { availabilityStatus: filters.availabilityStatus }
          : {}),
      })
      .then((r) => {
        if (active) setItems(r.items);
      })
      .catch((reason) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          void onUnauthorized();
        else if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [api, filters, onUnauthorized]);
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">ENGINEERS</p>
          <h2>技術者一覧</h2>
        </div>
        <div className="account-actions">
          {items && <span className="count">{items.length}件</span>}
          <button className="primary-button" onClick={onCreate}>
            技術者を登録
          </button>
        </div>
      </div>
      <form
        className="project-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ q: q.trim(), status, availabilityStatus });
        }}
      >
        <label>
          技術者検索
          <input
            type="search"
            maxLength={100}
            value={q}
            placeholder="管理番号・氏名"
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label>
          状態
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as EngineerStatus | '')}
          >
            <option value="">すべて</option>
            {Object.entries(engineerStatusLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          稼働状態
          <select
            value={availabilityStatus}
            onChange={(e) =>
              setAvailabilityStatus(e.target.value as AvailabilityStatus | '')
            }
          >
            <option value="">すべて</option>
            {Object.entries(availabilityLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button">検索</button>
      </form>
      {error ? (
        <p role="alert">技術者一覧を読み込めませんでした。</p>
      ) : items === null ? (
        <p role="status">技術者を読み込んでいます…</p>
      ) : items.length === 0 ? (
        <p>表示できる技術者はありません。</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>管理番号</th>
                <th>氏名</th>
                <th>状態</th>
                <th>稼働状態</th>
                <th>最寄駅</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => onOpen(item.id)}>
                  <td>
                    <button className="link-button">{item.managementNo}</button>
                  </td>
                  <td>
                    {item.displayName ?? `${item.familyName} ${item.givenName}`}
                  </td>
                  <td>{engineerStatusLabels[item.status]}</td>
                  <td>{availabilityLabels[item.availabilityStatus]}</td>
                  <td>{item.nearestStation ?? '未登録'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function EngineerDetail({
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
  const [engineer, setEngineer] = useState<Engineer | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [auditEvents, setAuditEvents] = useState<
    Awaited<ReturnType<ProjectsApi['listEngineerAudit']>>['items'] | null
  >(null);
  const [auditError, setAuditError] = useState(false);
  const [privateDetail, setPrivateDetail] =
    useState<EngineerPrivateDetail | null>(null);
  const [showPrivate, setShowPrivate] = useState(false);
  const [privateError, setPrivateError] = useState(false);
  const [affiliations, setAffiliations] = useState<
    EngineerAffiliation[] | null
  >(null);
  const [affiliationError, setAffiliationError] = useState(false);
  const [preferences, setPreferences] = useState<EngineerPreference[] | null>(
    null,
  );
  const [preferenceError, setPreferenceError] = useState(false);
  const [skills, setSkills] = useState<EngineerSkill[] | null>(null);
  const [qualifications, setQualifications] = useState<
    EngineerQualification[] | null
  >(null);
  const [capabilityError, setCapabilityError] = useState(false);
  const [careerHistories, setCareerHistories] = useState<
    EngineerCareerHistory[] | null
  >(null);
  const [resumes, setResumes] = useState<EngineerResume[] | null>(null);
  const [careerResumeError, setCareerResumeError] = useState(false);
  useEffect(() => {
    let active = true;
    api
      .getEngineer(id)
      .then((r) => {
        if (active) setEngineer(r);
      })
      .catch((reason) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          void onUnauthorized();
        else if (active) setError(reason);
      });
    return () => {
      active = false;
    };
  }, [api, id, onUnauthorized]);
  async function removeEngineer(event: FormEvent) {
    event.preventDefault();
    if (!engineer) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteEngineer(engineer.id, engineer.rowVersion, deleteReason);
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
      setAuditEvents((await api.listEngineerAudit(id)).items);
    } catch {
      setAuditError(true);
    }
  }
  async function loadPrivate() {
    setPrivateError(false);
    try {
      setPrivateDetail(await api.getEngineerPrivate(id));
      setShowPrivate(true);
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.status === 404) {
        setPrivateDetail(null);
        setShowPrivate(true);
      } else setPrivateError(true);
    }
  }
  async function loadAffiliations() {
    setAffiliationError(false);
    try {
      setAffiliations((await api.listEngineerAffiliations(id)).items);
    } catch {
      setAffiliationError(true);
    }
  }
  async function loadPreferences() {
    setPreferenceError(false);
    try {
      setPreferences((await api.listEngineerPreferences(id)).items);
    } catch {
      setPreferenceError(true);
    }
  }
  async function loadCapabilities() {
    setCapabilityError(false);
    try {
      const [s, q] = await Promise.all([
        api.listEngineerSkills(id),
        api.listEngineerQualifications(id),
      ]);
      setSkills(s.items);
      setQualifications(q.items);
    } catch {
      setCapabilityError(true);
    }
  }
  async function loadCareerResumes() {
    setCareerResumeError(false);
    try {
      const [c, r] = await Promise.all([
        api.listEngineerCareerHistories(id),
        api.listEngineerResumes(id),
      ]);
      setCareerHistories(c.items);
      setResumes(r.items);
    } catch {
      setCareerResumeError(true);
    }
  }
  return (
    <section className="panel">
      <button className="secondary-button" onClick={onBack}>
        技術者一覧へ戻る
      </button>
      {error ? <ErrorNotice error={error} /> : null}
      {engineer === null && error === null ? (
        <p role="status">技術者を読み込んでいます…</p>
      ) : engineer ? (
        <>
          <div className="section-heading">
            <div>
              <p className="section-kicker">{engineer.managementNo}</p>
              <h2>
                {engineer.displayName ??
                  `${engineer.familyName} ${engineer.givenName}`}
              </h2>
            </div>
            <span className="status-badge">
              {availabilityLabels[engineer.availabilityStatus]}
            </span>
          </div>
          <dl className="detail-grid">
            <div>
              <dt>状態</dt>
              <dd>{engineerStatusLabels[engineer.status]}</dd>
            </div>
            <div>
              <dt>提案可能日</dt>
              <dd>{engineer.availableFrom ?? '未登録'}</dd>
            </div>
            <div>
              <dt>最寄駅</dt>
              <dd>{engineer.nearestStation ?? '未登録'}</dd>
            </div>
            <div>
              <dt>概要</dt>
              <dd>{engineer.summary ?? '未登録'}</dd>
            </div>
          </dl>
          <div className="account-actions">
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
              className="secondary-button"
              onClick={() => void loadPrivate()}
            >
              機密個人情報
            </button>
            <button
              className="secondary-button"
              onClick={() => void loadAffiliations()}
            >
              所属・契約履歴
            </button>
            <button
              className="secondary-button"
              onClick={() => void loadPreferences()}
            >
              希望条件
            </button>
            <button
              className="secondary-button"
              onClick={() => void loadCapabilities()}
            >
              スキル・資格
            </button>
            <button
              className="secondary-button"
              onClick={() => void loadCareerResumes()}
            >
              職務経歴・経歴書
            </button>
            <button
              className="danger-button"
              onClick={() => setShowDelete(true)}
            >
              削除
            </button>
          </div>
          {showDelete ? (
            <form
              className="delete-panel"
              onSubmit={(event) => void removeEngineer(event)}
            >
              <h3>技術者を削除</h3>
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
          {privateError ? (
            <p className="error" role="alert">
              機密個人情報を表示する権限がないか、取得に失敗しました。
            </p>
          ) : null}
          {affiliationError ? (
            <p className="error" role="alert">
              所属・契約履歴の取得に失敗しました。
            </p>
          ) : null}
          {preferenceError ? (
            <p className="error" role="alert">
              希望条件の取得に失敗しました。
            </p>
          ) : null}
          {capabilityError ? (
            <p className="error" role="alert">
              スキル・資格の取得に失敗しました。
            </p>
          ) : null}
          {careerResumeError ? (
            <p className="error" role="alert">
              職務経歴・経歴書の取得に失敗しました。
            </p>
          ) : null}
          {showPrivate ? (
            <EngineerPrivateForm
              api={api}
              engineerId={id}
              detail={privateDetail}
              onSaved={setPrivateDetail}
            />
          ) : null}
          {affiliations ? (
            <EngineerAffiliationPanel
              api={api}
              engineerId={id}
              items={affiliations}
              onSaved={() => void loadAffiliations()}
            />
          ) : null}
          {preferences ? (
            <EngineerPreferencePanel
              api={api}
              engineerId={id}
              items={preferences}
              onSaved={() => void loadPreferences()}
            />
          ) : null}
          {skills && qualifications ? (
            <EngineerCapabilityPanel
              api={api}
              engineerId={id}
              skills={skills}
              qualifications={qualifications}
              onSaved={() => void loadCapabilities()}
            />
          ) : null}
          {careerHistories && resumes ? (
            <EngineerCareerResumePanel
              api={api}
              engineerId={id}
              histories={careerHistories}
              resumes={resumes}
              onSaved={() => void loadCareerResumes()}
            />
          ) : null}
          {auditEvents ? (
            <section
              className="audit-panel"
              aria-labelledby="engineer-audit-heading"
            >
              <h3 id="engineer-audit-heading">監査履歴</h3>
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

function EngineerForm({
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
  const [input, setInput] = useState<EngineerInput>({
    managementNo: '',
    familyName: '',
    givenName: '',
    displayName: null,
    status: 'candidate',
    availabilityStatus: 'unknown',
    availableFrom: null,
    nearestStation: null,
    summary: null,
  });
  const [rowVersion, setRowVersion] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!id) return;
    void api
      .getEngineer(id)
      .then((e) => {
        setInput({
          managementNo: e.managementNo,
          familyName: e.familyName,
          givenName: e.givenName,
          displayName: e.displayName,
          status: e.status,
          availabilityStatus: e.availabilityStatus,
          availableFrom: e.availableFrom,
          nearestStation: e.nearestStation,
          summary: e.summary,
        });
        setRowVersion(e.rowVersion);
      })
      .catch(setError);
  }, [api, id]);
  const set = (name: keyof EngineerInput, value: string) =>
    setInput((current) => ({
      ...current,
      [name]:
        value === '' &&
        ![
          'managementNo',
          'familyName',
          'givenName',
          'status',
          'availabilityStatus',
        ].includes(name)
          ? null
          : value,
    }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = id
        ? await api.updateEngineer(id, rowVersion!, input)
        : await api.createEngineer(input);
      onSaved(saved.id);
    } catch (reason) {
      setError(reason);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="panel">
      <h2>{id ? '技術者編集' : '技術者登録'}</h2>
      {error ? <ErrorNotice error={error} subject="技術者" /> : null}
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
          姓
          <input
            required
            maxLength={100}
            value={input.familyName}
            onChange={(e) => set('familyName', e.target.value)}
          />
        </label>
        <label>
          名
          <input
            required
            maxLength={100}
            value={input.givenName}
            onChange={(e) => set('givenName', e.target.value)}
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
          状態
          <select
            value={input.status}
            onChange={(e) => set('status', e.target.value)}
          >
            {Object.entries(engineerStatusLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          稼働状態
          <select
            value={input.availabilityStatus}
            onChange={(e) => set('availabilityStatus', e.target.value)}
          >
            {Object.entries(availabilityLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          提案可能日
          <input
            type="date"
            value={input.availableFrom ?? ''}
            onChange={(e) => set('availableFrom', e.target.value)}
          />
        </label>
        <label>
          最寄駅
          <input
            maxLength={200}
            value={input.nearestStation ?? ''}
            onChange={(e) => set('nearestStation', e.target.value)}
          />
        </label>
        <label>
          概要
          <textarea
            maxLength={2000}
            value={input.summary ?? ''}
            onChange={(e) => set('summary', e.target.value)}
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

const contactStatusLabels: Record<ContactStatus, string> = {
  active: '在籍',
  inactive: '休止',
  left_company: '退職',
  unknown: '不明',
};
function ContactList({
  api,
  onOpen,
  onUnauthorized,
}: {
  api: ProjectsApi;
  onOpen: (id: string) => void;
  onUnauthorized: () => Promise<void>;
}) {
  const [items, setItems] = useState<CompanyContact[] | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ContactStatus | ''>('');
  const [filters, setFilters] = useState({
    q: '',
    status: '' as ContactStatus | '',
  });
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    let active = true;
    setItems(null);
    setError(false);
    api
      .listCompanyContacts({
        limit: 50,
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      })
      .then((r) => {
        if (active) setItems(r.items);
      })
      .catch((reason) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          void onUnauthorized();
        else if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [api, filters, onUnauthorized]);
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">CONTACTS</p>
          <h2>担当者一覧</h2>
        </div>
        <div>
          <button className="primary-button" onClick={() => setCreating(true)}>
            担当者を登録
          </button>
          {items && <span className="count">{items.length}件</span>}
        </div>
      </div>
      {creating && (
        <ContactForm
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            const value = await api.createCompanyContact(input);
            setCreating(false);
            onOpen(value.id);
          }}
        />
      )}
      <form
        className="project-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ q: q.trim(), status });
        }}
      >
        <label>
          担当者検索
          <input
            type="search"
            maxLength={100}
            value={q}
            placeholder="管理番号・氏名・メール"
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label>
          状態
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ContactStatus | '')}
          >
            <option value="">すべて</option>
            {Object.entries(contactStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button">検索</button>
      </form>
      {error ? (
        <p role="alert">担当者一覧を読み込めませんでした。</p>
      ) : items === null ? (
        <p role="status">担当者を読み込んでいます…</p>
      ) : items.length === 0 ? (
        <p>表示できる担当者はありません。</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>管理番号</th>
                <th>氏名</th>
                <th>部署・役職</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => onOpen(item.id)}>
                  <td>
                    <button className="link-button">{item.managementNo}</button>
                  </td>
                  <td>
                    {item.familyName} {item.givenName}
                  </td>
                  <td>
                    {[item.departmentName, item.positionTitle]
                      .filter(Boolean)
                      .join(' / ') || '未登録'}
                  </td>
                  <td>{contactStatusLabels[item.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function ContactDetail({
  api,
  id,
  onBack,
  onUnauthorized,
}: {
  api: ProjectsApi;
  id: string;
  onBack: () => void;
  onUnauthorized: () => Promise<void>;
}) {
  const [contact, setContact] = useState<CompanyContact | null>(null);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [auditEvents, setAuditEvents] = useState<
    Awaited<ReturnType<ProjectsApi['listCompanyContactAudit']>>['items'] | null
  >(null);
  const [auditError, setAuditError] = useState(false);
  useEffect(() => {
    let active = true;
    api
      .getCompanyContact(id)
      .then((r) => {
        if (active) setContact(r);
      })
      .catch((reason) => {
        if (reason instanceof ApiClientError && reason.status === 401)
          void onUnauthorized();
        else if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [api, id, onUnauthorized]);
  async function removeContact(event: FormEvent) {
    event.preventDefault();
    if (!contact) return;
    setDeleting(true);
    setError(false);
    try {
      await api.deleteCompanyContact(
        contact.id,
        contact.rowVersion,
        deleteReason,
      );
      onBack();
    } catch {
      setError(true);
    } finally {
      setDeleting(false);
    }
  }
  async function loadAudit() {
    setAuditError(false);
    try {
      setAuditEvents((await api.listCompanyContactAudit(id)).items);
    } catch {
      setAuditError(true);
    }
  }
  return (
    <section className="panel">
      <button className="secondary-button" onClick={onBack}>
        担当者一覧へ戻る
      </button>
      {error ? (
        <p role="alert">担当者詳細を読み込めませんでした。</p>
      ) : contact === null ? (
        <p role="status">担当者を読み込んでいます…</p>
      ) : (
        <>
          <div className="section-heading">
            <div>
              <p className="section-kicker">{contact.managementNo}</p>
              <h2>
                {contact.familyName} {contact.givenName}
              </h2>
            </div>
            <span className="status-badge">
              {contactStatusLabels[contact.status]}
            </span>
          </div>
          <button className="primary-button" onClick={() => setEditing(true)}>
            編集
          </button>
          <button className="secondary-button" onClick={() => void loadAudit()}>
            監査履歴
          </button>
          <button className="danger-button" onClick={() => setShowDelete(true)}>
            削除
          </button>
          {editing && (
            <ContactForm
              contact={contact}
              onCancel={() => setEditing(false)}
              onSubmit={async (input) => {
                const value = await api.updateCompanyContact(
                  contact.id,
                  contact.rowVersion,
                  input,
                );
                setContact(value);
                setEditing(false);
              }}
            />
          )}
          <dl className="detail-grid">
            <div>
              <dt>部署</dt>
              <dd>{contact.departmentName ?? '未登録'}</dd>
            </div>
            <div>
              <dt>役職</dt>
              <dd>{contact.positionTitle ?? '未登録'}</dd>
            </div>
            <div>
              <dt>メール</dt>
              <dd>{contact.email ?? '未登録'}</dd>
            </div>
            <div>
              <dt>電話</dt>
              <dd>{contact.phone ?? '未登録'}</dd>
            </div>
            <div>
              <dt>携帯電話</dt>
              <dd>{contact.mobilePhone ?? '未登録'}</dd>
            </div>
            <div>
              <dt>主担当</dt>
              <dd>{contact.isPrimary ? 'はい' : 'いいえ'}</dd>
            </div>
          </dl>
          {showDelete ? (
            <form
              className="delete-panel"
              onSubmit={(event) => void removeContact(event)}
            >
              <h3>担当者を削除</h3>
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
            <section
              className="audit-panel"
              aria-labelledby="contact-audit-heading"
            >
              <h3 id="contact-audit-heading">監査履歴</h3>
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
      )}
    </section>
  );
}

function ContactForm({
  contact,
  onSubmit,
  onCancel,
}: {
  contact?: CompanyContact;
  onSubmit: (input: CompanyContactInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<CompanyContactInput>({
    companyId: contact?.companyId ?? '',
    managementNo: contact?.managementNo ?? '',
    familyName: contact?.familyName ?? '',
    givenName: contact?.givenName ?? null,
    departmentName: contact?.departmentName ?? null,
    positionTitle: contact?.positionTitle ?? null,
    email: contact?.email ?? null,
    phone: contact?.phone ?? null,
    mobilePhone: contact?.mobilePhone ?? null,
    isPrimary: contact?.isPrimary ?? false,
    status: contact?.status ?? 'active',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const text = (name: keyof CompanyContactInput, raw: string) =>
    setValue((current) => ({ ...current, [name]: raw || null }));
  return (
    <form
      className="entity-form"
      onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        void onSubmit(value)
          .catch((reason) => {
            setError(
              reason instanceof ApiClientError && reason.status === 409
                ? '他のユーザーが更新しました。再読み込みしてください。'
                : '担当者を保存できませんでした。',
            );
          })
          .finally(() => setSaving(false));
      }}
    >
      <label>
        会社ID
        <input
          required
          value={value.companyId}
          onChange={(e) => setValue({ ...value, companyId: e.target.value })}
        />
      </label>
      <label>
        管理番号
        <input
          required
          maxLength={32}
          value={value.managementNo}
          onChange={(e) => setValue({ ...value, managementNo: e.target.value })}
        />
      </label>
      <label>
        姓
        <input
          required
          maxLength={100}
          value={value.familyName}
          onChange={(e) => setValue({ ...value, familyName: e.target.value })}
        />
      </label>
      <label>
        名
        <input
          maxLength={100}
          value={value.givenName ?? ''}
          onChange={(e) => text('givenName', e.target.value)}
        />
      </label>
      <label>
        部署
        <input
          maxLength={200}
          value={value.departmentName ?? ''}
          onChange={(e) => text('departmentName', e.target.value)}
        />
      </label>
      <label>
        役職
        <input
          maxLength={200}
          value={value.positionTitle ?? ''}
          onChange={(e) => text('positionTitle', e.target.value)}
        />
      </label>
      <label>
        メール
        <input
          type="email"
          maxLength={320}
          value={value.email ?? ''}
          onChange={(e) => text('email', e.target.value)}
        />
      </label>
      <label>
        電話
        <input
          maxLength={50}
          value={value.phone ?? ''}
          onChange={(e) => text('phone', e.target.value)}
        />
      </label>
      <label>
        携帯電話
        <input
          maxLength={50}
          value={value.mobilePhone ?? ''}
          onChange={(e) => text('mobilePhone', e.target.value)}
        />
      </label>
      <label>
        状態
        <select
          value={value.status}
          onChange={(e) =>
            setValue({ ...value, status: e.target.value as ContactStatus })
          }
        >
          {Object.entries(contactStatusLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.isPrimary}
          onChange={(e) => setValue({ ...value, isPrimary: e.target.checked })}
        />
        主担当
      </label>
      {error && <p role="alert">{error}</p>}
      <div>
        <button className="primary-button" disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
        <button type="button" className="secondary-button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
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
  onDeleted,
}: {
  api: ProjectsApi;
  id: string;
  onBack: () => void;
  onUnauthorized: () => Promise<void>;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [auditEvents, setAuditEvents] = useState<
    Awaited<ReturnType<ProjectsApi['listCompanyAudit']>>['items'] | null
  >(null);
  const [auditError, setAuditError] = useState(false);
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
  async function removeCompany(event: FormEvent) {
    event.preventDefault();
    if (!company) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteCompany(company.id, company.rowVersion, deleteReason);
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
      setAuditEvents((await api.listCompanyAudit(id)).items);
    } catch {
      setAuditError(true);
    }
  }
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
          {showDelete ? (
            <form
              className="delete-panel"
              onSubmit={(event) => void removeCompany(event)}
            >
              <h3>会社を削除</h3>
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
            <section
              className="audit-panel"
              aria-labelledby="company-audit-heading"
            >
              <h3 id="company-audit-heading">監査履歴</h3>
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
      )}
    </section>
  );
}

function EngineerCareerResumePanel({
  api,
  engineerId,
  histories,
  resumes,
  onSaved,
}: {
  api: ProjectsApi;
  engineerId: string;
  histories: EngineerCareerHistory[];
  resumes: EngineerResume[];
  onSaved: () => void;
}) {
  const [projectName, setProjectName] = useState('');
  const [title, setTitle] = useState('職務経歴書');
  const [fileName, setFileName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function addCareer(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.saveEngineerCareerHistory(engineerId, 'new', 0, {
        projectName,
        clientName: null,
        roleName: null,
        industry: null,
        overview: null,
        responsibilities: null,
        achievements: null,
        teamSize: null,
        startedOn: null,
        endedOn: null,
        displayOrder: histories.length,
        sourceResumeVersionId: null,
      });
      setProjectName('');
      onSaved();
    } catch (x) {
      setError(x);
    } finally {
      setSaving(false);
    }
  }
  async function addResume(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.addEngineerResumeVersion(engineerId, 'new', 0, {
        title,
        resumeStatus: 'active',
        fileStoragePath: null,
        originalFileName: fileName || null,
        mimeType: null,
        fileSizeBytes: null,
        fileChecksum: null,
        sourceType: 'manual',
      });
      setFileName('');
      onSaved();
    } catch (x) {
      setError(x);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      className="audit-panel"
      aria-labelledby="engineer-career-resume-heading"
    >
      <h3 id="engineer-career-resume-heading">職務経歴・経歴書</h3>
      {error ? <ErrorNotice error={error} /> : null}
      <h4>職務経歴</h4>
      {histories.length ? (
        <ul>
          {histories.map((x) => (
            <li key={x.id}>
              <strong>{x.projectName}</strong>
              {x.roleName ? ` — ${x.roleName}` : ''}（
              {x.startedOn ?? '開始日未登録'}〜{x.endedOn ?? '現在'}）
            </li>
          ))}
        </ul>
      ) : (
        <p>職務経歴はありません。</p>
      )}
      <form onSubmit={(e) => void addCareer(e)}>
        <label>
          プロジェクト名
          <input
            required
            maxLength={300}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </label>
        <button
          className="primary-button"
          disabled={saving || !projectName.trim()}
        >
          職務経歴を追加
        </button>
      </form>
      <h4>経歴書バージョン</h4>
      {resumes.length ? (
        <ul>
          {resumes.map((x) => (
            <li key={x.id}>
              <strong>{x.title}</strong>（{x.versions.length}版）
            </li>
          ))}
        </ul>
      ) : (
        <p>経歴書はありません。</p>
      )}
      <form onSubmit={(e) => void addResume(e)}>
        <label>
          タイトル
          <input
            required
            maxLength={300}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          元ファイル名（任意）
          <input
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
          />
        </label>
        <button className="primary-button" disabled={saving || !title.trim()}>
          新しい版を追加
        </button>
      </form>
    </section>
  );
}

function EngineerCapabilityPanel({
  api,
  engineerId,
  skills,
  qualifications,
  onSaved,
}: {
  api: ProjectsApi;
  engineerId: string;
  skills: EngineerSkill[];
  qualifications: EngineerQualification[];
  onSaved: () => void;
}) {
  const emptySkill: EngineerSkillInput = {
    skillId: '',
    experienceMonths: null,
    proficiencyLevel: null,
    lastUsedOn: null,
    evidenceType: null,
    evidenceNote: null,
    verificationStatus: 'unverified',
    isPrimary: false,
  };
  const emptyQualification: EngineerQualificationInput = {
    name: '',
    issuer: null,
    credentialId: null,
    acquiredOn: null,
    expiresOn: null,
    notes: null,
  };
  const [skill, setSkill] = useState(emptySkill);
  const [qualification, setQualification] = useState(emptyQualification);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  async function saveSkill(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.saveEngineerSkill(engineerId, null, 0, skill);
      setSkill(emptySkill);
      onSaved();
    } catch (reason) {
      setError(reason);
    } finally {
      setSaving(false);
    }
  }
  async function saveQualification(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.saveEngineerQualification(engineerId, null, 0, qualification);
      setQualification(emptyQualification);
      onSaved();
    } catch (reason) {
      setError(reason);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      className="audit-panel"
      aria-labelledby="engineer-capabilities-heading"
    >
      <h3 id="engineer-capabilities-heading">スキル・資格</h3>
      {error ? <ErrorNotice error={error} /> : null}
      <h4>スキル</h4>
      {skills.length ? (
        <ul>
          {skills.map((x) => (
            <li key={x.id}>
              <strong>{x.skillName}</strong>
              <span>
                {x.experienceMonths === null
                  ? '経験期間未登録'
                  : `${x.experienceMonths}か月`}
                ／レベル{x.proficiencyLevel ?? '未登録'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>スキルは未登録です。</p>
      )}
      <form className="detail-form" onSubmit={(e) => void saveSkill(e)}>
        <label>
          スキルID
          <input
            required
            value={skill.skillId}
            onChange={(e) =>
              setSkill((v) => ({ ...v, skillId: e.target.value }))
            }
          />
        </label>
        <label>
          経験月数
          <input
            type="number"
            min="0"
            value={skill.experienceMonths ?? ''}
            onChange={(e) =>
              setSkill((v) => ({
                ...v,
                experienceMonths:
                  e.target.value === '' ? null : Number(e.target.value),
              }))
            }
          />
        </label>
        <label>
          習熟度
          <input
            type="number"
            min="1"
            max="5"
            value={skill.proficiencyLevel ?? ''}
            onChange={(e) =>
              setSkill((v) => ({
                ...v,
                proficiencyLevel:
                  e.target.value === '' ? null : Number(e.target.value),
              }))
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={skill.isPrimary}
            onChange={(e) =>
              setSkill((v) => ({ ...v, isPrimary: e.target.checked }))
            }
          />
          主要スキル
        </label>
        <button className="primary-button" disabled={saving}>
          スキルを追加
        </button>
      </form>
      <h4>資格</h4>
      {qualifications.length ? (
        <ul>
          {qualifications.map((x) => (
            <li key={x.id}>
              <strong>{x.name}</strong>
              <span>
                {x.issuer ?? '発行元未登録'}／取得日{x.acquiredOn ?? '未登録'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>資格は未登録です。</p>
      )}
      <form className="detail-form" onSubmit={(e) => void saveQualification(e)}>
        <label>
          資格名
          <input
            required
            maxLength={200}
            value={qualification.name}
            onChange={(e) =>
              setQualification((v) => ({ ...v, name: e.target.value }))
            }
          />
        </label>
        <label>
          発行元
          <input
            value={qualification.issuer ?? ''}
            onChange={(e) =>
              setQualification((v) => ({
                ...v,
                issuer: e.target.value || null,
              }))
            }
          />
        </label>
        <label>
          取得日
          <input
            type="date"
            value={qualification.acquiredOn ?? ''}
            onChange={(e) =>
              setQualification((v) => ({
                ...v,
                acquiredOn: e.target.value || null,
              }))
            }
          />
        </label>
        <label>
          有効期限
          <input
            type="date"
            value={qualification.expiresOn ?? ''}
            onChange={(e) =>
              setQualification((v) => ({
                ...v,
                expiresOn: e.target.value || null,
              }))
            }
          />
        </label>
        <button className="primary-button" disabled={saving}>
          資格を追加
        </button>
      </form>
    </section>
  );
}

function EngineerPreferencePanel({
  api,
  engineerId,
  items,
  onSaved,
}: {
  api: ProjectsApi;
  engineerId: string;
  items: EngineerPreference[];
  onSaved: () => void;
}) {
  const empty: EngineerPreferenceInput = {
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: null,
    desiredRateMin: null,
    desiredRateMax: null,
    currencyCode: 'JPY',
    remotePreference: 'flexible',
    weeklyDaysMin: null,
    weeklyDaysMax: null,
    overtimeLimitHours: null,
    availableFrom: null,
    notes: null,
    locations: [],
    contractTypes: [],
  };
  const [editing, setEditing] = useState<EngineerPreference | null>(
    items[0] ?? null,
  );
  const [input, setInput] = useState<EngineerPreferenceInput>(
    items[0] ? { ...items[0] } : empty,
  );
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const set = (name: keyof EngineerPreferenceInput, value: unknown) =>
    setInput((v) => ({ ...v, [name]: value }));
  const number = (value: string) => (value === '' ? null : Number(value));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.saveEngineerPreference(
        engineerId,
        editing?.id ?? null,
        editing?.rowVersion ?? 0,
        input,
      );
      onSaved();
    } catch (reason) {
      setError(reason);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      className="audit-panel"
      aria-labelledby="engineer-preference-heading"
    >
      <div className="section-heading">
        <h3 id="engineer-preference-heading">希望条件</h3>
        <button
          className="secondary-button"
          onClick={() => {
            setEditing(null);
            setInput(empty);
          }}
        >
          履歴を追加
        </button>
      </div>
      {items.length === 0 ? (
        <p>希望条件はありません。</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <strong>
                {item.effectiveFrom}〜{item.effectiveTo ?? '現在'} /{' '}
                {item.remotePreference}
              </strong>
              <span>
                希望単価: {item.desiredRateMin ?? '未設定'}〜
                {item.desiredRateMax ?? '未設定'} {item.currencyCode}
              </span>
              <button
                className="secondary-button"
                onClick={() => {
                  setEditing(item);
                  setInput({ ...item });
                }}
              >
                編集
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? <ErrorNotice error={error} subject="希望条件" /> : null}
      <form className="project-form" onSubmit={(e) => void submit(e)}>
        <label>
          開始日
          <input
            required
            type="date"
            value={input.effectiveFrom}
            onChange={(e) => set('effectiveFrom', e.target.value)}
          />
        </label>
        <label>
          終了日
          <input
            type="date"
            min={input.effectiveFrom}
            value={input.effectiveTo ?? ''}
            onChange={(e) => set('effectiveTo', e.target.value || null)}
          />
        </label>
        <label>
          希望単価（下限）
          <input
            type="number"
            min="0"
            value={input.desiredRateMin ?? ''}
            onChange={(e) => set('desiredRateMin', number(e.target.value))}
          />
        </label>
        <label>
          希望単価（上限）
          <input
            type="number"
            min="0"
            value={input.desiredRateMax ?? ''}
            onChange={(e) => set('desiredRateMax', number(e.target.value))}
          />
        </label>
        <label>
          リモート希望
          <select
            value={input.remotePreference}
            onChange={(e) => set('remotePreference', e.target.value)}
          >
            <option value="flexible">柔軟</option>
            <option value="onsite">常駐</option>
            <option value="hybrid">併用</option>
            <option value="remote">リモート</option>
          </select>
        </label>
        <label>
          週稼働日数（下限）
          <input
            type="number"
            min="0"
            max="7"
            step="0.5"
            value={input.weeklyDaysMin ?? ''}
            onChange={(e) => set('weeklyDaysMin', number(e.target.value))}
          />
        </label>
        <label>
          週稼働日数（上限）
          <input
            type="number"
            min="0"
            max="7"
            step="0.5"
            value={input.weeklyDaysMax ?? ''}
            onChange={(e) => set('weeklyDaysMax', number(e.target.value))}
          />
        </label>
        <label>
          稼働可能日
          <input
            type="date"
            value={input.availableFrom ?? ''}
            onChange={(e) => set('availableFrom', e.target.value || null)}
          />
        </label>
        <label>
          希望勤務地（改行区切り）
          <textarea
            value={input.locations.join('\n')}
            onChange={(e) =>
              set(
                'locations',
                e.target.value
                  .split('\n')
                  .map((x) => x.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>
        <label>
          希望契約形態（改行区切り）
          <textarea
            value={input.contractTypes.join('\n')}
            onChange={(e) =>
              set(
                'contractTypes',
                e.target.value
                  .split('\n')
                  .map((x) => x.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>
        <label>
          備考
          <textarea
            maxLength={2000}
            value={input.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || null)}
          />
        </label>
        <button className="primary-button" disabled={saving}>
          {saving ? '保存中…' : editing ? '希望条件を更新' : '履歴を追加'}
        </button>
      </form>
    </section>
  );
}

function EngineerAffiliationPanel({
  api,
  engineerId,
  items,
  onSaved,
}: {
  api: ProjectsApi;
  engineerId: string;
  items: EngineerAffiliation[];
  onSaved: () => void;
}) {
  const empty: EngineerAffiliationInput = {
    companyId: '',
    affiliationType: 'employee',
    contractType: null,
    startDate: '',
    endDate: null,
    isPrimary: false,
    notes: null,
  };
  const [editing, setEditing] = useState<EngineerAffiliation | null>(null);
  const [input, setInput] = useState<EngineerAffiliationInput>(empty);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const edit = (item: EngineerAffiliation | null) => {
    setEditing(item);
    setInput(
      item
        ? {
            companyId: item.companyId,
            affiliationType: item.affiliationType,
            contractType: item.contractType,
            startDate: item.startDate,
            endDate: item.endDate,
            isPrimary: item.isPrimary,
            notes: item.notes,
          }
        : empty,
    );
  };
  const set = (name: keyof EngineerAffiliationInput, value: string | boolean) =>
    setInput((v) => ({
      ...v,
      [name]: typeof value === 'string' && value === '' ? null : value,
    }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.saveEngineerAffiliation(
        engineerId,
        editing?.id ?? null,
        editing?.rowVersion ?? 0,
        input,
      );
      edit(null);
      onSaved();
    } catch (reason) {
      setError(reason);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      className="audit-panel"
      aria-labelledby="engineer-affiliation-heading"
    >
      <div className="section-heading">
        <h3 id="engineer-affiliation-heading">所属・契約履歴</h3>
        <button className="secondary-button" onClick={() => edit(null)}>
          履歴を追加
        </button>
      </div>
      {items.length === 0 ? (
        <p>所属・契約履歴はありません。</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <strong>
                {item.startDate}〜{item.endDate ?? '現在'} /{' '}
                {item.affiliationType}
              </strong>
              <span>
                会社ID: {item.companyId}
                {item.contractType ? ` / ${item.contractType}` : ''}
                {item.isPrimary ? ' / 主所属' : ''}
              </span>
              <button className="secondary-button" onClick={() => edit(item)}>
                編集
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? <ErrorNotice error={error} subject="所属・契約履歴" /> : null}
      <form className="project-form" onSubmit={(e) => void submit(e)}>
        <label>
          会社ID
          <input
            required
            pattern="[0-9a-fA-F-]{36}"
            value={input.companyId}
            onChange={(e) => set('companyId', e.target.value)}
          />
        </label>
        <label>
          所属形態
          <select
            value={input.affiliationType}
            onChange={(e) => set('affiliationType', e.target.value)}
          >
            <option value="employee">社員</option>
            <option value="freelance">フリーランス</option>
            <option value="partner_employee">BP社員</option>
            <option value="subcontractor">再委託</option>
            <option value="other">その他</option>
          </select>
        </label>
        <label>
          契約形態
          <input
            maxLength={100}
            value={input.contractType ?? ''}
            onChange={(e) => set('contractType', e.target.value)}
          />
        </label>
        <label>
          開始日
          <input
            required
            type="date"
            value={input.startDate}
            onChange={(e) => set('startDate', e.target.value)}
          />
        </label>
        <label>
          終了日
          <input
            type="date"
            min={input.startDate}
            value={input.endDate ?? ''}
            onChange={(e) => set('endDate', e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={input.isPrimary}
            onChange={(e) => set('isPrimary', e.target.checked)}
          />
          主所属
        </label>
        <label>
          備考
          <textarea
            maxLength={2000}
            value={input.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
          />
        </label>
        <button className="primary-button" disabled={saving}>
          {saving ? '保存中…' : editing ? '履歴を更新' : '履歴を追加'}
        </button>
      </form>
    </section>
  );
}

function EngineerPrivateForm({
  api,
  engineerId,
  detail,
  onSaved,
}: {
  api: ProjectsApi;
  engineerId: string;
  detail: EngineerPrivateDetail | null;
  onSaved: (detail: EngineerPrivateDetail) => void;
}) {
  const empty: EngineerPrivateInput = {
    birthDate: null,
    gender: null,
    personalEmail: null,
    phone: null,
    postalCode: null,
    prefecture: null,
    city: null,
    addressLine: null,
    emergencyContact: null,
    notes: null,
  };
  const [input, setInput] = useState<EngineerPrivateInput>(
    detail
      ? {
          birthDate: detail.birthDate,
          gender: detail.gender,
          personalEmail: detail.personalEmail,
          phone: detail.phone,
          postalCode: detail.postalCode,
          prefecture: detail.prefecture,
          city: detail.city,
          addressLine: detail.addressLine,
          emergencyContact: detail.emergencyContact,
          notes: detail.notes,
        }
      : empty,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (detail)
      setInput({
        birthDate: detail.birthDate,
        gender: detail.gender,
        personalEmail: detail.personalEmail,
        phone: detail.phone,
        postalCode: detail.postalCode,
        prefecture: detail.prefecture,
        city: detail.city,
        addressLine: detail.addressLine,
        emergencyContact: detail.emergencyContact,
        notes: detail.notes,
      });
  }, [detail]);
  const set = (name: keyof EngineerPrivateInput, value: string) =>
    setInput((current) => ({
      ...current,
      [name]: value === '' ? null : value,
    }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await api.updateEngineerPrivate(
          engineerId,
          detail?.rowVersion ?? 0,
          input,
        ),
      );
    } catch (reason) {
      setError(reason);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="audit-panel" aria-labelledby="engineer-private-heading">
      <h3 id="engineer-private-heading">機密個人情報</h3>
      <p>専用権限を持つ担当者だけが参照・編集できます。</p>
      {error ? <ErrorNotice error={error} subject="機密個人情報" /> : null}
      <form className="project-form" onSubmit={(event) => void submit(event)}>
        <label>
          生年月日
          <input
            type="date"
            value={input.birthDate ?? ''}
            onChange={(e) => set('birthDate', e.target.value)}
          />
        </label>
        <label>
          性別
          <select
            value={input.gender ?? ''}
            onChange={(e) => set('gender', e.target.value)}
          >
            <option value="">未登録</option>
            <option value="male">男性</option>
            <option value="female">女性</option>
            <option value="other">その他</option>
            <option value="undisclosed">非開示</option>
          </select>
        </label>
        <label>
          個人メール
          <input
            type="email"
            maxLength={320}
            value={input.personalEmail ?? ''}
            onChange={(e) => set('personalEmail', e.target.value)}
          />
        </label>
        <label>
          電話
          <input
            maxLength={50}
            value={input.phone ?? ''}
            onChange={(e) => set('phone', e.target.value)}
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
            maxLength={200}
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
          緊急連絡先
          <textarea
            maxLength={500}
            value={input.emergencyContact ?? ''}
            onChange={(e) => set('emergencyContact', e.target.value)}
          />
        </label>
        <label>
          機密メモ
          <textarea
            maxLength={2000}
            value={input.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
          />
        </label>
        <button className="primary-button" disabled={saving}>
          {saving ? '保存中…' : '機密個人情報を保存'}
        </button>
      </form>
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

function formatDateTime(value: string | null): string {
  return value === null
    ? '未設定'
    : new Intl.DateTimeFormat('ja-JP', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value));
}
