import { createRoot } from 'react-dom/client';
import { App } from '../../../src/app/App.js';
import { createProjectsApi } from '../../../src/api/client.js';
import type {
  Proposal,
  ProposalMessageDraft,
} from '../../../src/api/generated.js';
import type { ProposalMessageDelivery } from '../../../src/api/proposal-message-delivery-types.js';
import type {
  AuthService,
  AuthSession,
} from '../../../src/auth/auth-client.js';
import '../../../src/styles.css';
import { company, engineer, match, project } from './sales-data.js';

// Only this fixture entry imports the fake service. The production entry never
// imports tests/browser, and the transport below never calls global fetch.
declare global {
  interface Window {
    fixtureSendCount: number;
    fixtureRetryCount: number;
    fixtureReviewCount: number;
    fixtureMatchCount: number;
  }
}
window.fixtureSendCount = 0;
window.fixtureRetryCount = 0;
window.fixtureReviewCount = 0;
window.fixtureMatchCount = 0;
const scenario = new URLSearchParams(window.location.search).get('scenario');
const proposalId = '66666666-6666-4666-8666-666666666666';
const messageId = '17171717-1717-4717-8717-171717171717';
const versionId = '18181818-1818-4818-8818-181818181818';
const session: AuthSession = {
  accessToken: 'fixture-access-only',
  refreshToken: 'fixture-refresh-only',
  expiresAt: 9_999_999_999,
  user: { id: 'fixture-user', email: 'user@example.test' },
  assuranceLevel: 'aal2',
  factors: [],
};
const auth: AuthService = {
  getSession: () => Promise.resolve(scenario === 'login' ? null : session),
  signIn: () => Promise.resolve(session),
  signOut: () => Promise.resolve(),
  onSessionChange: () => () => undefined,
  enrollMfa: () => Promise.reject(new Error('Fixture only')),
  verifyMfa: () => Promise.reject(new Error('Fixture only')),
  requestPasswordReset: () => Promise.reject(new Error('Fixture only')),
  consumeAuthCallback: () => Promise.resolve(null),
  updatePassword: () => Promise.reject(new Error('Fixture only')),
};
const proposal: Proposal = {
  id: proposalId,
  managementNo: 'PR-FIXTURE',
  projectPositionId: versionId,
  engineerId: versionId,
  destinationCompanyId: versionId,
  destinationContactId: null,
  resumeVersionId: null,
  requirementVersionId: null,
  proposedUnitPrice: 800000,
  currencyCode: 'JPY',
  status: 'approved',
  proposedStartDate: null,
  validityDate: null,
  updatedAt: '2026-10-16T00:00:00Z',
  rowVersion: 1,
};
const draft: ProposalMessageDraft = {
  id: messageId,
  proposalId,
  projectId: versionId,
  engineerId: versionId,
  channel: 'email',
  status: scenario === 'journey' ? 'draft' : 'approved',
  subject: 'モバイル確認用の提案メール',
  bodyText:
    'ブラウザー内だけの架空メールです。\n' +
    '長い本文の折り返し確認'.repeat(12),
  messageTemplateId: null,
  currentVersionId: versionId,
  currentVersionNo: 1,
  currentGenerationSource: 'manual',
  approvedVersionId: scenario === 'journey' ? null : versionId,
  approvedAt: scenario === 'journey' ? null : '2026-10-16T00:00:00Z',
  aiExecutionId: versionId,
  aiStatus: 'completed',
  aiErrorCode: null,
  aiErrorMessage: null,
  promptVersion: 'fixture',
  modelProvider: 'fixture',
  modelName: 'fixture',
  reviewStatus: scenario === 'journey' ? 'pending' : 'approved',
  reviewComment: null,
  generation: null,
  recipients: [
    {
      type: 'to',
      name: '架空宛先',
      address: 'long-fixture-sales-recipient@example.test',
    },
    { type: 'cc', name: '架空CC', address: 'cc@example.test' },
  ],
  createdAt: '2026-10-16T00:00:00Z',
  updatedAt: '2026-10-16T00:00:00Z',
  rowVersion: 1,
};
const delivery: ProposalMessageDelivery = {
  messageId,
  proposalId,
  status: scenario === 'retry' ? 'failed' : 'approved',
  sentAt: null,
  approvedVersionId: versionId,
  rowVersion: 1,
  recipients: draft.recipients.map((recipient, index) => ({
    ...recipient,
    id: `fixture-recipient-${index}`,
    deliveryStatus:
      scenario === 'retry' ? (index === 0 ? 'failed' : 'sent') : 'pending',
    attempts:
      scenario === 'retry'
        ? [
            {
              id: `fixture-attempt-${index}`,
              attemptNo: 1,
              status: index === 0 ? 'failed' : 'accepted',
              provider: 'fixture',
              providerMessageId: null,
              attemptedAt: '2026-10-16T00:00:00Z',
              responseCode: index === 0 ? '450' : '250',
              errorMessage: null,
            },
          ]
        : [],
  })),
};
const fixtureFetch: typeof fetch = (input, init) => {
  const path = new URL(
    input instanceof Request ? input.url : input,
    window.location.origin,
  ).pathname;
  const json = (value: unknown, status = 200) =>
    Promise.resolve(Response.json(value, { status }));
  if (path === '/api/v1/auth/context')
    return scenario === 'expired'
      ? json({ error: { code: 'expired', message: 'Fixture only' } }, 401)
      : scenario === 'forbidden'
        ? json({ error: { code: 'forbidden', message: 'Fixture only' } }, 403)
        : json({ requiresMfa: false });
  if (path === '/api/v1/companies')
    return json({ items: [company], page: { limit: 50, nextCursor: null } });
  if (path === `/api/v1/companies/${company.id}`) return json(company);
  if (path === '/api/v1/engineers')
    return json({ items: [engineer], page: { limit: 50, nextCursor: null } });
  if (path === `/api/v1/engineers/${engineer.id}`) return json(engineer);
  if (path === '/api/v1/projects')
    return json({ items: [project], page: { limit: 50, nextCursor: null } });
  if (path === `/api/v1/projects/${project.id}`) return json(project);
  if (path.endsWith('/ai/matches/latest')) return json(match);
  if (path.endsWith('/ai/match-engineers') && init?.method === 'POST') {
    window.fixtureMatchCount += 1;
    return json(match);
  }
  if (path.endsWith('/ai/extractions/latest')) return json(null);
  if (path === '/api/v1/proposals')
    return json({ items: [proposal], page: { limit: 50, nextCursor: null } });
  if (path === `/api/v1/proposals/${proposalId}`) return json(proposal);
  if (path.endsWith('/ai/message-drafts/latest')) return json(draft);
  if (
    path.endsWith(`/ai/message-drafts/${messageId}/review`) &&
    init?.method === 'POST'
  ) {
    window.fixtureReviewCount += 1;
    Object.assign(draft, {
      status: 'approved',
      reviewStatus: 'approved',
      approvedVersionId: versionId,
      approvedAt: '2026-10-18T00:01:00Z',
      rowVersion: 2,
    });
    return json(draft);
  }
  if (path.endsWith('/delivery'))
    return scenario === 'history-error'
      ? json({ error: { code: 'forbidden', message: 'Fixture only' } }, 403)
      : json(
          scenario === 'send-error' && window.fixtureSendCount > 0
            ? { ...delivery, status: 'queued' }
            : delivery,
        );
  if (init?.method === 'POST' && /\/(send|retry)$/u.test(path)) {
    if (path.endsWith('/retry')) window.fixtureRetryCount += 1;
    else window.fixtureSendCount += 1;
    if (scenario === 'send-error')
      return json(
        { error: { code: 'unavailable', message: 'Fixture only' } },
        503,
      );
    return json({
      ...delivery,
      status: 'sent',
      sentAt: '2026-10-16T00:01:00Z',
    });
  }
  return json(
    { error: { code: 'fixture_route_missing', message: 'Fixture only' } },
    404,
  );
};
const root = document.getElementById('root');
if (!root) throw new Error('Fixture root missing');
createRoot(root).render(
  <App
    auth={auth}
    api={createProjectsApi({
      getAccessToken: () => session.accessToken,
      fetch: fixtureFetch,
    })}
  />,
);
