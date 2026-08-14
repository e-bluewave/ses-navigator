import { describe, expect, it, vi } from 'vitest';

import { ApiClientError, createProjectsApi } from './client.js';

describe('generated projects API client', () => {
  it('lists and reads invoices with finance filters', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [], page: { limit: 50, nextCursor: null } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'invoice-1' }), { status: 200 }),
      );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.listInvoices({
      q: '青波',
      status: 'overdue',
      invoiceType: 'sales',
      dueFrom: '2026-08-01',
      dueTo: '2026-08-31',
    });
    await api.getInvoice('invoice-1');
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/v1/invoices?q=%E9%9D%92%E6%B3%A2&status=overdue&invoiceType=sales&dueFrom=2026-08-01&dueTo=2026-08-31',
      { headers: { authorization: 'Bearer access-token' } },
    );
    expect(request).toHaveBeenNthCalledWith(2, '/api/v1/invoices/invoice-1', {
      headers: { authorization: 'Bearer access-token' },
    });
  });

  it('sends invoice draft writes and status transitions with If-Match', async () => {
    const request = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'invoice-1' }), { status: 200 }),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    const input = {
      invoiceNo: 'INV-1',
      invoiceType: 'sales' as const,
      contractId: null,
      billingAccountId: '11111111-1111-4111-8111-111111111111',
      billingPeriodStart: null,
      billingPeriodEnd: null,
      issueDate: '2026-08-14',
      dueDate: '2026-08-31',
      currency: 'JPY',
      items: [],
    };
    await api.getInvoiceOptions();
    await api.createInvoice(input);
    await api.updateInvoice('invoice-1', 2, input);
    await api.transitionInvoiceStatus('invoice-1', 3, {
      status: 'issued',
      reason: null,
    });
    await api.registerInvoicePayment('invoice-1', 4, {
      paymentType: 'receipt',
      paymentDate: '2026-08-20',
      amount: 1000,
      currency: 'JPY',
      paymentMethod: 'bank_transfer',
      bankFeeAmount: 0,
    });
    await api.reverseInvoicePayment('invoice-1', 'payment-1', 5, {
      reason: '重複入金',
    });
    expect(request.mock.calls[0]![0]).toBe('/api/v1/invoices/options');
    expect(request.mock.calls[1]![0]).toBe('/api/v1/invoices');
    expect(request.mock.calls[2]![1]).toMatchObject({
      method: 'PUT',
      headers: { 'if-match': '"2"' },
    });
    expect(request.mock.calls[3]![0]).toBe('/api/v1/invoices/invoice-1/status');
    expect(request.mock.calls[3]![1]).toMatchObject({
      method: 'POST',
      headers: { 'if-match': '"3"' },
    });
    expect(request.mock.calls[4]![0]).toBe(
      '/api/v1/invoices/invoice-1/payments',
    );
    expect(request.mock.calls[4]![1]).toMatchObject({
      headers: { 'if-match': '"4"' },
    });
    expect(request.mock.calls[5]![0]).toBe(
      '/api/v1/invoices/invoice-1/payments/payment-1/reversal',
    );
    expect(request.mock.calls[5]![1]).toMatchObject({
      headers: { 'if-match': '"5"' },
    });
  });

  it('lists and reads monthly work logs with filters', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [], page: { limit: 50, nextCursor: null } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'work-log-1' }), { status: 200 }),
      );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.listWorkLogs({
      q: '山田',
      status: 'approved',
      workMonth: '2026-08-01',
    });
    await api.getWorkLog('work-log-1');
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/v1/work-logs?q=%E5%B1%B1%E7%94%B0&status=approved&workMonth=2026-08-01',
      { headers: { authorization: 'Bearer access-token' } },
    );
    expect(request).toHaveBeenNthCalledWith(2, '/api/v1/work-logs/work-log-1', {
      headers: { authorization: 'Bearer access-token' },
    });
  });

  it('sends work log create, versioned update, and approval transition', async () => {
    const request = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'work-log-1' }), { status: 200 }),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    const input = {
      contractId: '11111111-1111-4111-8111-111111111111',
      engineerId: '22222222-2222-4222-8222-222222222222',
      workMonth: '2026-08-01',
      scheduledDays: 20,
      scheduledHours: 160,
      absenceHours: 0,
      notes: null,
      details: [
        {
          workDate: '2026-08-03',
          workType: 'work' as const,
          startTime: '09:00',
          endTime: '18:00',
          breakMinutes: 60,
          workHours: 8,
          overtimeHours: 0,
          description: null,
        },
      ],
    };
    await api.createWorkLog(input);
    await api.updateWorkLog('work-log-1', 2, input);
    await api.transitionWorkLogStatus('work-log-1', 3, {
      status: 'approved',
      reason: '確認済み',
      approvedByName: '顧客担当者',
    });
    expect(request.mock.calls[0]![0]).toBe('/api/v1/work-logs');
    expect(request.mock.calls[1]![1]).toMatchObject({
      method: 'PUT',
      headers: { 'if-match': '"2"' },
    });
    expect(request.mock.calls[2]![0]).toBe(
      '/api/v1/work-logs/work-log-1/status',
    );
    expect(request.mock.calls[2]![1]).toMatchObject({
      method: 'POST',
      headers: { 'if-match': '"3"' },
    });
  });

  it('lists and reads engagements with bearer authentication', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [], page: { limit: 50, nextCursor: null } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'engagement-1' }), { status: 200 }),
      );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.listEngagements({ q: '青波', status: 'active' });
    await api.getEngagement('engagement-1');
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/v1/engagements?q=%E9%9D%92%E6%B3%A2&status=active',
      { headers: { authorization: 'Bearer access-token' } },
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/v1/engagements/engagement-1',
      { headers: { authorization: 'Bearer access-token' } },
    );
  });

  it('sends engagement create, versioned update, and status transition', async () => {
    const request = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'engagement-1' }), { status: 200 }),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    const input = {
      engagementNo: 'ENG-000001',
      contractId: '11111111-1111-4111-8111-111111111111',
      engineerId: '22222222-2222-4222-8222-222222222222',
      previousEngagementId: null,
      plannedStartDate: '2026-09-01',
      plannedEndDate: null,
      roleName: '開発',
      workLocation: '東京都',
      remoteFrequency: '週3日',
      condition: {
        effectiveFrom: '2026-09-01',
        effectiveTo: null,
        monthlySalesAmount: 900000,
        monthlyCostAmount: 650000,
        currency: 'JPY',
        settlementLowerHours: 140,
        settlementUpperHours: 180,
        notes: null,
      },
    };
    await api.createEngagement(input);
    await api.updateEngagement('engagement-1', 2, input);
    await api.transitionEngagementStatus('engagement-1', 3, {
      status: 'preparing',
      reason: '開始準備',
      actualDate: null,
    });
    expect(request.mock.calls[0]![0]).toBe('/api/v1/engagements');
    expect(request.mock.calls[1]![1]).toMatchObject({
      method: 'PUT',
      headers: { 'if-match': '"2"' },
    });
    expect(request.mock.calls[2]![0]).toBe(
      '/api/v1/engagements/engagement-1/status',
    );
    expect(request.mock.calls[2]![1]).toMatchObject({
      method: 'POST',
      headers: { 'if-match': '"3"' },
    });
  });

  it('lists and reads contracts with bearer authentication', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [], page: { limit: 50, nextCursor: null } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'contract-1' }), { status: 200 }),
      );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.listContracts({ q: 'CN-000001', status: 'active' });
    await api.getContract('contract-1');
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/v1/contracts?q=CN-000001&status=active',
      { headers: { authorization: 'Bearer access-token' } },
    );
    expect(request).toHaveBeenNthCalledWith(2, '/api/v1/contracts/contract-1', {
      headers: { authorization: 'Bearer access-token' },
    });
  });

  it('sends contract create, versioned update, and approval transitions', async () => {
    const request = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'contract-1' }), { status: 200 }),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    const input = {
      contractNo: 'CN-000001',
      projectId: '22222222-2222-4222-8222-222222222222',
      proposalId: null,
      engineerId: null,
      contractType: 'ses' as const,
      title: '基幹システム刷新 SES契約',
      startDate: '2026-09-01',
      endDate: null,
      autoRenew: false,
      currency: 'JPY',
      monthlyAmount: 900000,
      hourlyAmount: null,
      settlementLowerHours: 140,
      settlementUpperHours: 180,
      paymentTerms: '月末締め翌月末払い',
      notes: null,
      parties: [],
      changeSummary: '初版',
    };
    await api.createContract(input);
    await api.updateContract('contract-1', 2, input);
    await api.transitionContractStatus('contract-1', 3, {
      status: 'review',
      reason: '承認をお願いします',
    });
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/v1/contracts',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(request.mock.calls[1]![0]).toBe('/api/v1/contracts/contract-1');
    expect(request.mock.calls[1]![1]).toMatchObject({
      method: 'PUT',
      headers: { 'if-match': '"2"' },
    });
    expect(request.mock.calls[2]![0]).toBe(
      '/api/v1/contracts/contract-1/status',
    );
    expect(request.mock.calls[2]![1]).toMatchObject({
      method: 'POST',
      headers: { 'if-match': '"3"' },
    });
  });

  it('wins a proposal with optimistic locking and an idempotency key', async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            proposal: { id: 'proposal-1' },
            contractId: 'contract-1',
            engagementId: 'engagement-1',
            created: true,
          }),
          { status: 200 },
        ),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
      createIdempotencyKey: () => 'proposal-win-key-1',
    });
    await api.winProposal('proposal-1', 4);
    expect(request).toHaveBeenCalledWith('/api/v1/proposals/proposal-1/win', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer access-token',
        'if-match': '"4"',
        'idempotency-key': 'proposal-win-key-1',
      },
      body: '{}',
    });
  });

  it('lists and reads engineers with bearer authentication', async () => {
    const request = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items: [],
            page: { limit: 50, nextCursor: null },
          }),
          { status: 200 },
        ),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.listEngineers({
      q: '青波',
      status: 'active',
      availabilityStatus: 'available',
    });
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/v1/engineers?q=%E9%9D%92%E6%B3%A2&status=active&availabilityStatus=available',
      { headers: { authorization: 'Bearer access-token' } },
    );
    await api.getEngineer('engineer-1');
    expect(request).toHaveBeenLastCalledWith('/api/v1/engineers/engineer-1', {
      headers: { authorization: 'Bearer access-token' },
    });
  });
  it('sends engineer create and versioned update requests', async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'engineer-1' }), { status: 200 }),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    const input = {
      managementNo: 'EN-001',
      familyName: '青波',
      givenName: '太郎',
      displayName: null,
      status: 'active' as const,
      availabilityStatus: 'available' as const,
      availableFrom: null,
      nearestStation: null,
      summary: null,
    };
    await api.createEngineer(input);
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/v1/engineers',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.updateEngineer('engineer-1', 3, input);
    expect(request).toHaveBeenLastCalledWith('/api/v1/engineers/engineer-1', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer access-token',
        'if-match': '"3"',
      },
      body: JSON.stringify(input),
    });
  });
  it('soft-deletes an engineer and reads its audit trail', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), { status: 200 }),
      );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.deleteEngineer('engineer-1', 3, '重複登録のため');
    expect(request).toHaveBeenNthCalledWith(1, '/api/v1/engineers/engineer-1', {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer access-token',
        'if-match': '"3"',
      },
      body: JSON.stringify({ reason: '重複登録のため' }),
    });
    await api.listEngineerAudit('engineer-1');
    expect(request).toHaveBeenLastCalledWith(
      '/api/v1/engineers/engineer-1/audit',
      { headers: { authorization: 'Bearer access-token' } },
    );
  });
  it('reads and version-updates engineer private details', async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ engineerId: 'engineer-1', rowVersion: 2 }),
          { status: 200 },
        ),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.getEngineerPrivate('engineer-1');
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/v1/engineers/engineer-1/private',
      { headers: { authorization: 'Bearer access-token' } },
    );
    const input = {
      birthDate: null,
      gender: null,
      personalEmail: 'engineer@example.com',
      phone: null,
      postalCode: null,
      prefecture: null,
      city: null,
      addressLine: null,
      emergencyContact: null,
      notes: null,
    };
    await api.updateEngineerPrivate('engineer-1', 1, input);
    expect(request).toHaveBeenLastCalledWith(
      '/api/v1/engineers/engineer-1/private',
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer access-token',
          'if-match': '"1"',
        },
        body: JSON.stringify(input),
      },
    );
  });
  it('sends contact create and versioned update requests', async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'contact-1' }), { status: 200 }),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    const input = {
      companyId: '11111111-1111-4111-8111-111111111111',
      managementNo: 'CT-001',
      familyName: '青波',
      givenName: '太郎',
      departmentName: null,
      positionTitle: null,
      email: 'taro@example.com',
      phone: null,
      mobilePhone: null,
      isPrimary: true,
      status: 'active' as const,
    };
    await api.createCompanyContact(input);
    expect(request).toHaveBeenLastCalledWith(
      '/api/v1/contacts',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.updateCompanyContact('contact-1', 4, input);
    expect(request).toHaveBeenLastCalledWith('/api/v1/contacts/contact-1', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer access-token',
        'if-match': '"4"',
      },
      body: JSON.stringify(input),
    });
  });
  it('soft-deletes a contact and reads its audit trail', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), { status: 200 }),
      );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.deleteCompanyContact('contact-1', 3, '退職のため');
    expect(request).toHaveBeenNthCalledWith(1, '/api/v1/contacts/contact-1', {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer access-token',
        'if-match': '"3"',
      },
      body: JSON.stringify({ reason: '退職のため' }),
    });
    await api.listCompanyContactAudit('contact-1');
    expect(request).toHaveBeenLastCalledWith(
      '/api/v1/contacts/contact-1/audit',
      { headers: { authorization: 'Bearer access-token' } },
    );
  });
  it('lists and reads company contacts with bearer authentication', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [], page: { limit: 50, nextCursor: null } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'contact-1' }), { status: 200 }),
      );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.listCompanyContacts({ q: '青波', status: 'active' });
    await api.getCompanyContact('contact-1');
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/v1/contacts?q=%E9%9D%92%E6%B3%A2&status=active',
      { headers: { authorization: 'Bearer access-token' } },
    );
    expect(request).toHaveBeenNthCalledWith(2, '/api/v1/contacts/contact-1', {
      headers: { authorization: 'Bearer access-token' },
    });
  });
  it('sends company create and versioned update requests', async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'company-1' }), { status: 200 }),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    const input = {
      managementNo: 'CO-000001',
      legalName: '青波株式会社',
      displayName: null,
      corporateNumber: null,
      postalCode: null,
      prefecture: null,
      city: null,
      addressLine: null,
      websiteUrl: null,
      representativeName: null,
      status: 'active' as const,
    };
    await api.createCompany(input);
    expect(request).toHaveBeenLastCalledWith(
      '/api/v1/companies',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.updateCompany('company-1', 3, input);
    expect(request).toHaveBeenLastCalledWith('/api/v1/companies/company-1', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer access-token',
        'if-match': '"3"',
      },
      body: JSON.stringify(input),
    });
  });
  it('sends typed company list parameters and reads a detail', async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ items: [], page: { limit: 20, nextCursor: null } }),
          { status: 200 },
        ),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.listCompanies({
      q: '青波',
      status: 'active',
      cursor: 'next',
      limit: 20,
    });
    expect(request).toHaveBeenLastCalledWith(
      '/api/v1/companies?q=%E9%9D%92%E6%B3%A2&status=active&cursor=next&limit=20',
      { headers: { authorization: 'Bearer access-token' } },
    );
  });
  it('soft-deletes a company and reads its audit trail', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), { status: 200 }),
      );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.deleteCompany(
      '22222222-2222-4222-8222-222222222222',
      2,
      '重複登録のため',
    );
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/v1/companies/22222222-2222-4222-8222-222222222222',
      {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer access-token',
          'if-match': '"2"',
        },
        body: JSON.stringify({ reason: '重複登録のため' }),
      },
    );
    await api.listCompanyAudit('22222222-2222-4222-8222-222222222222');
  });
  it('sends bearer authentication and typed query parameters', async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ items: [], page: { limit: 20, nextCursor: null } }),
          { status: 200 },
        ),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.listProjects({
      q: '基幹',
      status: 'open',
      recruitmentStatus: 'recruiting',
      cursor: 'next-page',
      limit: 20,
    });
    expect(request).toHaveBeenCalledWith(
      '/api/v1/projects?q=%E5%9F%BA%E5%B9%B9&status=open&recruitmentStatus=recruiting&cursor=next-page&limit=20',
      {
        headers: { authorization: 'Bearer access-token' },
      },
    );
  });

  it('maps an API error response to ApiClientError', async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: 'forbidden', message: 'Denied', requestId: 'req-1' },
          }),
          { status: 403 },
        ),
      ),
    );
    const api = createProjectsApi({
      getAccessToken: () => null,
      fetch: request,
    });
    await expect(api.listProjects()).rejects.toEqual(
      new ApiClientError(403, 'forbidden', 'Denied', 'req-1'),
    );
  });

  it('sends a soft-delete reason with If-Match and accepts 204', async () => {
    const request = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    const api = createProjectsApi({
      getAccessToken: () => 'access-token',
      fetch: request,
    });
    await api.deleteProject(
      '11111111-1111-4111-8111-111111111111',
      2,
      '重複登録のため',
    );
    expect(request).toHaveBeenCalledWith(
      '/api/v1/projects/11111111-1111-4111-8111-111111111111',
      {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer access-token',
          'if-match': '"2"',
        },
        body: JSON.stringify({ reason: '重複登録のため' }),
      },
    );
  });
});
