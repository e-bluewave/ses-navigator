import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  Invoice,
  InvoiceRepository,
  InvoiceSummary,
} from '../src/modules/invoices/invoice-repository.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';

const summary: InvoiceSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  invoiceNo: 'INV-2026-0001',
  invoiceType: 'sales',
  contractId: '22222222-2222-4222-8222-222222222222',
  contractTitle: '基幹システム刷新 SES契約',
  billingCompanyId: '33333333-3333-4333-8333-333333333333',
  billingCompanyName: '株式会社サンプル',
  billingPeriodStart: '2026-07-01',
  billingPeriodEnd: '2026-07-31',
  issueDate: '2026-08-01',
  dueDate: '2026-08-31',
  status: 'partially_paid',
  currency: 'JPY',
  subtotal: 1000000,
  taxAmount: 100000,
  totalAmount: 1100000,
  paidAmount: 500000,
  balanceAmount: 600000,
  sentAt: '2026-08-02T00:00:00Z',
  updatedAt: '2026-08-10T00:00:00Z',
  rowVersion: 2,
};
const invoice: Invoice = {
  ...summary,
  billingAccount: {
    id: '44444444-4444-4444-8444-444444444444',
    companyId: summary.billingCompanyId,
    accountType: 'receivable',
    accountName: '本社請求先',
    closingDay: 31,
    paymentMonthOffset: 1,
    paymentDay: 31,
    invoiceDeliveryMethod: 'email',
    isDefault: true,
  },
  items: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      lineNo: 1,
      itemType: 'service',
      description: '7月分技術支援',
      quantity: 1,
      unit: '式',
      unitPrice: 1000000,
      taxRate: 10,
      amount: 1000000,
      taxAmount: 100000,
      workLogId: null,
      displayOrder: 1,
    },
  ],
  payments: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      paymentType: 'receipt',
      paymentDate: '2026-08-10',
      amount: 500000,
      currency: 'JPY',
      paymentMethod: 'bank_transfer',
      bankFeeAmount: 0,
    },
  ],
  statusHistories: [],
};
const input = {
  invoiceNo: 'INV-2026-0002',
  invoiceType: 'sales' as const,
  contractId: summary.contractId,
  billingAccountId: invoice.billingAccount.id,
  billingPeriodStart: '2026-08-01',
  billingPeriodEnd: '2026-08-31',
  issueDate: '2026-09-01',
  dueDate: '2026-09-30',
  currency: 'JPY',
  items: [
    {
      itemType: 'service' as const,
      description: '8月分技術支援',
      quantity: 1,
      unit: '式',
      unitPrice: 1000000,
      taxRate: 10,
      amount: 1000000,
      taxAmount: 100000,
      workLogId: null,
    },
  ],
};
const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));
function repository(
  overrides: Partial<InvoiceRepository> = {},
): InvoiceRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    canManage: vi.fn(() => Promise.resolve(true)),
    listBillingOptions: vi.fn(() =>
      Promise.resolve([
        {
          ...invoice.billingAccount,
          companyName: summary.billingCompanyName,
        },
      ]),
    ),
    list: vi.fn(() => Promise.resolve({ items: [summary], nextCursor: null })),
    findById: vi.fn(() => Promise.resolve(invoice)),
    create: vi.fn(() =>
      Promise.resolve({ ...invoice, status: 'draft' as const }),
    ),
    update: vi.fn(() =>
      Promise.resolve({ ...invoice, status: 'draft' as const }),
    ),
    transitionStatus: vi.fn(() => Promise.resolve(invoice)),
    registerPayment: vi.fn(() => Promise.resolve(invoice)),
    reversePayment: vi.fn(() => Promise.resolve(invoice)),
    ...overrides,
  };
}
function app(invoices = repository()) {
  const instance = buildApp({ authentication, invoices });
  apps.push(instance);
  return instance;
}

describe('invoice read API', () => {
  it('lists authorized invoices with filters', async () => {
    const list = vi.fn(() =>
      Promise.resolve({ items: [summary], nextCursor: null }),
    );
    const response = await app(repository({ list })).inject({
      method: 'GET',
      url: '/api/v1/invoices?q=サンプル&status=partially_paid&invoiceType=sales&dueFrom=2026-08-01&dueTo=2026-08-31&limit=20',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [summary],
      page: { limit: 20, nextCursor: null },
    });
    expect(list).toHaveBeenCalledWith('valid', {
      limit: 20,
      query: 'サンプル',
      status: 'partially_paid',
      invoiceType: 'sales',
      dueFrom: '2026-08-01',
      dueTo: '2026-08-31',
    });
  });

  it('encodes and accepts the compound cursor', async () => {
    const next = {
      issueDate: summary.issueDate,
      updatedAt: summary.updatedAt,
      id: summary.id,
    };
    const list = vi.fn(() =>
      Promise.resolve({ items: [summary], nextCursor: next }),
    );
    const first = await app(repository({ list })).inject({
      method: 'GET',
      url: '/api/v1/invoices?limit=1',
      headers: { authorization: 'Bearer valid' },
    });
    const cursor = first.json<{ page: { nextCursor: string } }>().page
      .nextCursor;
    const second = await app(repository({ list })).inject({
      method: 'GET',
      url: `/api/v1/invoices?limit=1&cursor=${encodeURIComponent(cursor)}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(second.statusCode).toBe(200);
    expect(list).toHaveBeenLastCalledWith('valid', { limit: 1, cursor: next });
  });

  it('returns detail with lines and payments', async () => {
    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/invoices/${summary.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(invoice);
  });

  it('requires finance.read and hides inaccessible detail', async () => {
    const forbidden = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: '/api/v1/invoices',
      headers: { authorization: 'Bearer valid' },
    });
    expect(forbidden.statusCode).toBe(403);
    const missing = await app(
      repository({ findById: vi.fn(() => Promise.resolve(null)) }),
    ).inject({
      method: 'GET',
      url: `/api/v1/invoices/${summary.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(missing.statusCode).toBe(404);
  });

  it.each([
    '/api/v1/invoices?limit=0',
    '/api/v1/invoices?status=unknown',
    '/api/v1/invoices?invoiceType=unknown',
    '/api/v1/invoices?dueFrom=2026-09-01&dueTo=2026-08-01',
    '/api/v1/invoices?cursor=broken',
  ])(`validates %s`, async (url) => {
    const response = await app().inject({
      method: 'GET',
      url,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('invoice write API', () => {
  it('creates and updates an invoice draft with optimistic locking', async () => {
    const create = vi.fn(() =>
      Promise.resolve({ ...invoice, status: 'draft' as const }),
    );
    const update = vi.fn(() =>
      Promise.resolve({ ...invoice, status: 'draft' as const }),
    );
    const created = await app(repository({ create, update })).inject({
      method: 'POST',
      url: '/api/v1/invoices',
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(created.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith('valid', input, expect.any(String));
    const updated = await app(repository({ create, update })).inject({
      method: 'PUT',
      url: `/api/v1/invoices/${summary.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: input,
    });
    expect(updated.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(
      'valid',
      summary.id,
      2,
      input,
      expect.any(String),
    );
  });

  it('returns billing-account form options', async () => {
    const response = await app().inject({
      method: 'GET',
      url: '/api/v1/invoices/options',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(
      response.json<{ billingAccounts: Array<{ accountName: string }> }>()
        .billingAccounts[0]?.accountName,
    ).toBe('本社請求先');
  });

  it('issues and sends an invoice and requires a reason to void', async () => {
    const transitionStatus = vi.fn(() =>
      Promise.resolve({ ...invoice, status: 'issued' as const }),
    );
    const issued = await app(repository({ transitionStatus })).inject({
      method: 'POST',
      url: `/api/v1/invoices/${summary.id}/status`,
      headers: { authorization: 'Bearer valid', 'if-match': '2' },
      payload: { status: 'issued', reason: null },
    });
    expect(issued.statusCode).toBe(200);
    expect(transitionStatus).toHaveBeenCalledWith(
      'valid',
      summary.id,
      2,
      { status: 'issued', reason: null },
      expect.any(String),
    );
    const invalidVoid = await app().inject({
      method: 'POST',
      url: `/api/v1/invoices/${summary.id}/status`,
      headers: { authorization: 'Bearer valid', 'if-match': '2' },
      payload: { status: 'void', reason: null },
    });
    expect(invalidVoid.statusCode).toBe(400);
  });

  it('requires finance.manage and If-Match', async () => {
    const forbidden = await app(
      repository({ canManage: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: '/api/v1/invoices',
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(forbidden.statusCode).toBe(403);
    const missingVersion = await app().inject({
      method: 'PUT',
      url: `/api/v1/invoices/${summary.id}`,
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(missingVersion.statusCode).toBe(428);
  });
});

describe('invoice payment allocation API', () => {
  it('registers a payment with invoice optimistic locking', async () => {
    const registerPayment = vi.fn(() =>
      Promise.resolve({ ...invoice, status: 'paid' as const }),
    );
    const response = await app(repository({ registerPayment })).inject({
      method: 'POST',
      url: `/api/v1/invoices/${summary.id}/payments`,
      headers: { authorization: 'Bearer valid', 'if-match': '"2"' },
      payload: {
        paymentType: 'receipt',
        paymentDate: '2026-08-20',
        amount: 600000,
        currency: 'JPY',
        paymentMethod: 'bank_transfer',
        bankFeeAmount: 0,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(registerPayment).toHaveBeenCalledWith(
      'valid',
      summary.id,
      2,
      {
        paymentType: 'receipt',
        paymentDate: '2026-08-20',
        amount: 600000,
        currency: 'JPY',
        paymentMethod: 'bank_transfer',
        bankFeeAmount: 0,
      },
      expect.any(String),
    );
  });

  it('reverses a payment with a mandatory reason', async () => {
    const reversePayment = vi.fn(() => Promise.resolve(invoice));
    const response = await app(repository({ reversePayment })).inject({
      method: 'POST',
      url: `/api/v1/invoices/${summary.id}/payments/${invoice.payments[0]!.id}/reversal`,
      headers: { authorization: 'Bearer valid', 'if-match': '2' },
      payload: { reason: '重複入金の訂正' },
    });
    expect(response.statusCode).toBe(200);
    expect(reversePayment).toHaveBeenCalledWith(
      'valid',
      summary.id,
      invoice.payments[0]!.id,
      2,
      '重複入金の訂正',
      expect.any(String),
    );
    const invalid = await app().inject({
      method: 'POST',
      url: `/api/v1/invoices/${summary.id}/payments/${invoice.payments[0]!.id}/reversal`,
      headers: { authorization: 'Bearer valid', 'if-match': '2' },
      payload: { reason: '' },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('validates payment amount and requires finance.manage', async () => {
    const invalid = await app().inject({
      method: 'POST',
      url: `/api/v1/invoices/${summary.id}/payments`,
      headers: { authorization: 'Bearer valid', 'if-match': '2' },
      payload: {
        paymentType: 'receipt',
        paymentDate: '2026-08-20',
        amount: 0,
        currency: 'JPY',
        paymentMethod: null,
        bankFeeAmount: 0,
      },
    });
    expect(invalid.statusCode).toBe(400);
    const forbidden = await app(
      repository({ canManage: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: `/api/v1/invoices/${summary.id}/payments`,
      headers: { authorization: 'Bearer valid', 'if-match': '2' },
      payload: {
        paymentType: 'receipt',
        paymentDate: '2026-08-20',
        amount: 1000,
        currency: 'JPY',
        paymentMethod: null,
        bankFeeAmount: 0,
      },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});
