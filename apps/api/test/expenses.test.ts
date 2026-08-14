import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  Expense,
  ExpenseRepository,
} from '../src/modules/expenses/expense-repository.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';

const expense: Expense = {
  id: '11111111-1111-4111-8111-111111111111',
  contractId: null,
  workLogId: null,
  engineerId: null,
  contractNo: null,
  contractTitle: null,
  engineerName: null,
  expenseDate: '2026-08-14',
  expenseType: 'transportation',
  description: '顧客訪問交通費',
  amount: 1200,
  taxAmount: 109,
  currency: 'JPY',
  status: 'draft',
  billable: false,
  invoiceId: null,
  approvedAt: null,
  updatedAt: '2026-08-14T00:00:00Z',
  rowVersion: 1,
  receiptPath: 'receipts/expense-1.pdf',
  notes: null,
  statusHistories: [],
  approval: null,
};
const input = {
  contractId: null,
  workLogId: null,
  engineerId: null,
  expenseDate: '2026-08-14',
  expenseType: 'transportation' as const,
  description: '顧客訪問交通費',
  amount: 1200,
  taxAmount: 109,
  currency: 'JPY',
  billable: false,
  receiptPath: 'receipts/expense-1.pdf',
  notes: null,
};
const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));
function repository(
  overrides: Partial<ExpenseRepository> = {},
): ExpenseRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    canManage: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() => Promise.resolve([expense])),
    findById: vi.fn(() => Promise.resolve(expense)),
    save: vi.fn(() => Promise.resolve(expense)),
    transition: vi.fn(() => Promise.resolve(expense)),
    ...overrides,
  };
}
function app(expenses = repository()) {
  const instance = buildApp({ authentication, expenses });
  apps.push(instance);
  return instance;
}

describe('expense API', () => {
  it('lists expenses with filters', async () => {
    const list = vi.fn(() => Promise.resolve([expense]));
    const response = await app(repository({ list })).inject({
      method: 'GET',
      url: '/api/v1/expenses?q=%E9%A1%A7%E5%AE%A2&status=draft&dateFrom=2026-08-01&dateTo=2026-08-31&limit=20',
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith('valid', {
      q: '顧客',
      status: 'draft',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
      limit: 20,
    });
  });
  it('creates and updates drafts with optimistic locking', async () => {
    const save = vi.fn(() => Promise.resolve(expense));
    const instance = app(repository({ save }));
    const created = await instance.inject({
      method: 'POST',
      url: '/api/v1/expenses',
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(created.statusCode).toBe(201);
    expect(save).toHaveBeenNthCalledWith(
      1,
      'valid',
      null,
      0,
      input,
      expect.any(String),
    );
    const updated = await instance.inject({
      method: 'PUT',
      url: `/api/v1/expenses/${expense.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: input,
    });
    expect(updated.statusCode).toBe(200);
    expect(save).toHaveBeenNthCalledWith(
      2,
      'valid',
      expense.id,
      1,
      input,
      expect.any(String),
    );
  });
  it('submits and rejects expenses with a required reason', async () => {
    const transition = vi.fn(() => Promise.resolve(expense));
    const instance = app(repository({ transition }));
    const submitted = await instance.inject({
      method: 'POST',
      url: `/api/v1/expenses/${expense.id}/status`,
      headers: { authorization: 'Bearer valid', 'if-match': '1' },
      payload: { status: 'submitted', reason: '承認依頼' },
    });
    expect(submitted.statusCode).toBe(200);
    expect(transition).toHaveBeenCalledWith(
      'valid',
      expense.id,
      1,
      'submitted',
      '承認依頼',
      expect.any(String),
    );
    const rejected = await instance.inject({
      method: 'POST',
      url: `/api/v1/expenses/${expense.id}/status`,
      headers: { authorization: 'Bearer valid', 'if-match': '1' },
      payload: { status: 'rejected', reason: null },
    });
    expect(rejected.statusCode).toBe(400);
  });
  it('enforces permission, validation, and If-Match', async () => {
    const forbidden = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: '/api/v1/expenses',
      headers: { authorization: 'Bearer valid' },
    });
    expect(forbidden.statusCode).toBe(403);
    const invalid = await app().inject({
      method: 'POST',
      url: '/api/v1/expenses',
      headers: { authorization: 'Bearer valid' },
      payload: { ...input, amount: 0 },
    });
    expect(invalid.statusCode).toBe(400);
    const missing = await app().inject({
      method: 'PUT',
      url: `/api/v1/expenses/${expense.id}`,
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(missing.statusCode).toBe(428);
  });
});
