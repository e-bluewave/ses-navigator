import { describe, expect, it, vi } from 'vitest';
import { createProjectsApi } from './client.js';

const proposalId = '11111111-1111-4111-8111-111111111111';
const messageId = '22222222-2222-4222-8222-222222222222';

describe('proposal message delivery client', () => {
  it('sends with a fresh idempotency key', async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            messageId,
            proposalId,
            status: 'sent',
            sentAt: '2026-09-25T08:00:00Z',
            approvedVersionId: '33333333-3333-4333-8333-333333333333',
            rowVersion: 4,
            recipients: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'token',
      baseUrl: '/api/v1',
      fetch: request as typeof fetch,
      createIdempotencyKey: () => 'delivery-key-1',
    });

    await api.sendProposalMessage(proposalId, messageId);

    expect(request).toHaveBeenCalledWith(
      `/api/v1/proposals/${proposalId}/messages/${messageId}/send`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer token',
          'idempotency-key': 'delivery-key-1',
        }),
      }),
    );
  });

  it('uses a new idempotency key for retry and reads delivery history', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            messageId,
            proposalId,
            status: 'sent',
            sentAt: '2026-09-25T08:00:00Z',
            approvedVersionId: '33333333-3333-4333-8333-333333333333',
            rowVersion: 5,
            recipients: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            messageId,
            proposalId,
            status: 'sent',
            sentAt: '2026-09-25T08:00:00Z',
            approvedVersionId: '33333333-3333-4333-8333-333333333333',
            rowVersion: 5,
            recipients: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    const api = createProjectsApi({
      getAccessToken: () => 'token',
      baseUrl: '/api/v1',
      fetch: request as typeof fetch,
      createIdempotencyKey: () => 'retry-key-1',
    });

    await api.retryProposalMessage(proposalId, messageId);
    await api.getProposalMessageDelivery(proposalId, messageId);

    expect(request.mock.calls[0]?.[0]).toBe(
      `/api/v1/proposals/${proposalId}/messages/${messageId}/retry`,
    );
    expect((request.mock.calls[0]?.[1] as RequestInit).headers).toEqual(
      expect.objectContaining({ 'idempotency-key': 'retry-key-1' }),
    );
    expect(request.mock.calls[1]?.[0]).toBe(
      `/api/v1/proposals/${proposalId}/messages/${messageId}/delivery`,
    );
  });
});
