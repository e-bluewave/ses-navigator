import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  ProposalMessageDraft,
  ProposalMessageDraftRepository,
} from '../src/modules/proposal-message-drafts/proposal-message-draft-repository.js';
import {
  OpenAIProposalMessageComposer,
  type ProposalMessageComposer,
  type ProposalMessageGeneration,
} from '../src/modules/proposal-message-drafts/proposal-message-draft-service.js';

const proposalId = '11111111-1111-4111-8111-111111111111';
const messageId = '22222222-2222-4222-8222-222222222222';
const executionId = '33333333-3333-4333-8333-333333333333';
const generation: ProposalMessageGeneration = {
  subject: 'TypeScriptエンジニアのご提案',
  bodyText: 'ご担当者様\n案件に合致する技術者をご提案します。',
  engineerIntroduction: 'TypeScriptの実務経験を持つ技術者です。',
  confirmationItems: ['参画開始日をご確認ください。'],
  evidence: [{ claim: 'TypeScript経験', source: '経歴書版1 スキル欄' }],
  policyChecks: [],
};
const draft: ProposalMessageDraft = {
  id: messageId,
  proposalId,
  projectId: '44444444-4444-4444-8444-444444444444',
  engineerId: '55555555-5555-4555-8555-555555555555',
  channel: 'email',
  status: 'draft',
  subject: generation.subject,
  bodyText: generation.bodyText,
  messageTemplateId: null,
  currentVersionId: '66666666-6666-4666-8666-666666666666',
  currentVersionNo: 1,
  currentGenerationSource: 'ai',
  approvedVersionId: null,
  approvedAt: null,
  aiExecutionId: executionId,
  aiStatus: 'review_required',
  aiErrorCode: null,
  aiErrorMessage: null,
  promptVersion: 'proposal.compose.v1',
  modelProvider: 'openai',
  modelName: 'test-model',
  reviewStatus: 'pending',
  reviewComment: null,
  generation,
  recipients: [
    { type: 'to', name: '営業担当者', address: 'sales@example.com' },
  ],
  createdAt: '2026-08-14T00:00:00Z',
  updatedAt: '2026-08-14T00:01:00Z',
  rowVersion: 2,
};

function repository(
  overrides: Partial<ProposalMessageDraftRepository> = {},
): ProposalMessageDraftRepository {
  return {
    canExecute: vi.fn(() => Promise.resolve(true)),
    canManage: vi.fn(() => Promise.resolve(true)),
    canReview: vi.fn(() => Promise.resolve(true)),
    canRead: vi.fn(() => Promise.resolve(true)),
    start: vi.fn(() =>
      Promise.resolve({
        draft: {
          ...draft,
          subject: '',
          bodyText: '',
          currentVersionId: null,
          currentVersionNo: null,
          currentGenerationSource: null,
          aiStatus: 'running',
          reviewStatus: null,
          generation: null,
          rowVersion: 1,
        },
        compositionInput: {
          proposal: { id: proposalId },
          destination: { companyName: '株式会社サンプル' },
          project: { name: '基幹システム刷新' },
          engineer: { displayName: 'EN-000001' },
          template: null,
          settings: { tone: 'standard' },
        },
      }),
    ),
    complete: vi.fn(() => Promise.resolve(draft)),
    fail: vi.fn(() => Promise.resolve()),
    update: vi.fn(() =>
      Promise.resolve({
        ...draft,
        currentVersionNo: 2,
        currentGenerationSource: 'manual' as const,
        rowVersion: 3,
      }),
    ),
    review: vi.fn(() =>
      Promise.resolve({
        ...draft,
        status: 'approved' as const,
        approvedVersionId: draft.currentVersionId,
        approvedAt: '2026-08-14T00:02:00Z',
        reviewStatus: 'approved',
        rowVersion: 3,
      }),
    ),
    get: vi.fn(() => Promise.resolve(draft)),
    ...overrides,
  };
}

function composer(
  overrides: Partial<ProposalMessageComposer> = {},
): ProposalMessageComposer {
  return {
    provider: 'openai',
    modelName: 'test-model',
    promptVersion: 'proposal.compose.v1',
    compose: vi.fn(() =>
      Promise.resolve({
        result: generation,
        usage: { inputTokens: 300, outputTokens: 120 },
      }),
    ),
    ...overrides,
  };
}

const apps: ReturnType<typeof buildApp>[] = [];
function app(
  proposalMessageDrafts = repository(),
  proposalMessageComposer = composer(),
) {
  const value = buildApp({
    authentication: {
      authenticate: (accessToken) =>
        Promise.resolve({ id: 'user-1', accessToken }),
    },
    proposalMessageDrafts,
    proposalMessageComposer,
  });
  apps.push(value);
  return value;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  await Promise.all(apps.splice(0).map((value) => value.close()));
});

describe('proposal message draft API', () => {
  it('uses strict structured output and disables provider storage', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const request = vi.fn<
      (input: string | URL, init?: RequestInit) => Promise<Response>
    >(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status: 'completed',
            output: [
              {
                content: [
                  { type: 'output_text', text: JSON.stringify(generation) },
                ],
              },
            ],
            usage: { input_tokens: 300, output_tokens: 120 },
          }),
        ),
      ),
    );
    vi.stubGlobal('fetch', request);
    const result = await new OpenAIProposalMessageComposer().compose({
      proposal: { id: proposalId },
      destination: {},
      project: {},
      engineer: {},
      template: null,
      settings: {},
    });
    expect(result).toEqual({
      result: generation,
      usage: { inputTokens: 300, outputTokens: 120 },
    });
    const rawBody = request.mock.calls[0]![1]?.body;
    if (typeof rawBody !== 'string') throw new Error('body is not a string');
    expect(JSON.parse(rawBody)).toMatchObject({
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    });
  });

  it('generates an editable draft without sending it', async () => {
    const complete = vi.fn(() => Promise.resolve(draft));
    const response = await app(repository({ complete })).inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/ai/message-drafts`,
      headers: { authorization: 'Bearer valid' },
      payload: { tone: 'standard', additionalInstructions: null },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: 'draft',
      subject: generation.subject,
    });
    expect(complete).toHaveBeenCalledWith(
      'valid',
      messageId,
      executionId,
      generation,
      300,
      120,
    );
  });

  it('records generation failure and returns a gateway error', async () => {
    const fail = vi.fn(() => Promise.resolve());
    const response = await app(
      repository({ fail }),
      composer({ compose: vi.fn(() => Promise.reject(new Error('down'))) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/ai/message-drafts`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(502);
    expect(fail).toHaveBeenCalledWith(
      'valid',
      messageId,
      executionId,
      'ai_error',
      'down',
    );
  });

  it('saves a new immutable edited version with optimistic locking', async () => {
    const update = vi.fn(() =>
      Promise.resolve({ ...draft, currentVersionNo: 2, rowVersion: 3 }),
    );
    const response = await app(repository({ update })).inject({
      method: 'PUT',
      url: `/api/v1/proposals/${proposalId}/ai/message-drafts/${messageId}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: { subject: '編集済み件名', bodyText: '編集済み本文' },
    });
    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(
      'valid',
      messageId,
      2,
      '編集済み件名',
      '編集済み本文',
      expect.any(String),
    );
  });

  it('approves only the current version and does not send it', async () => {
    const review = vi.fn(() =>
      Promise.resolve({ ...draft, status: 'approved' as const, rowVersion: 3 }),
    );
    const response = await app(repository({ review })).inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/ai/message-drafts/${messageId}/review`,
      headers: { authorization: 'Bearer valid', 'if-match': '2' },
      payload: { decision: 'approve', reviewComment: '内容確認済み' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ status: string }>().status).toBe('approved');
    expect(review).toHaveBeenCalledWith(
      'valid',
      messageId,
      2,
      'approve',
      '内容確認済み',
      expect.any(String),
    );
  });

  it('requires AI execution and message management permissions', async () => {
    const response = await app(
      repository({ canExecute: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/ai/message-drafts`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(403);
  });
});
