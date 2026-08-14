import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type {
  AccountingExportBatch,
  AccountingExportRepository,
} from '../src/modules/accounting-exports/accounting-export-repository.js';
import type { AuthenticationService } from '../src/plugins/authentication.js';

const batch: AccountingExportBatch = {
  id: '11111111-1111-4111-8111-111111111111',
  accountingPeriodId: '22222222-2222-4222-8222-222222222222',
  periodMonth: '2026-08-01',
  versionNo: 1,
  exportFormat: 'generic_csv',
  status: 'generated',
  generatedAt: '2026-08-14T00:00:00Z',
  exportedAt: null,
  exportReference: null,
  lineCount: 2,
  debitTotal: 110000,
  creditTotal: 110000,
  updatedAt: '2026-08-14T00:00:00Z',
  rowVersion: 1,
  lines: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      lineNo: 1,
      entryDate: '2026-08-01',
      accountCode: '1200',
      accountName: '売掛金',
      debitAmount: 110000,
      creditAmount: 0,
      currency: 'JPY',
      description: '請求 INV-001',
      sourceType: 'invoice',
      sourceId: '44444444-4444-4444-8444-444444444444',
    },
  ],
};

const authentication: AuthenticationService = {
  authenticate: (accessToken) => Promise.resolve({ id: 'user-a', accessToken }),
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function repository(
  overrides: Partial<AccountingExportRepository> = {},
): AccountingExportRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    canManage: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() => Promise.resolve([batch])),
    findById: vi.fn(() => Promise.resolve(batch)),
    generate: vi.fn(() => Promise.resolve(batch)),
    markExported: vi.fn(() => Promise.resolve(batch)),
    ...overrides,
  };
}

function app(accountingExports = repository()) {
  const instance = buildApp({ authentication, accountingExports });
  apps.push(instance);
  return instance;
}

describe('accounting export API', () => {
  it('lists export batches with a period filter', async () => {
    const list = vi.fn(() => Promise.resolve([batch]));
    const response = await app(repository({ list })).inject({
      method: 'GET',
      url: `/api/v1/accounting-exports?accountingPeriodId=${batch.accountingPeriodId}&limit=20`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [batch] });
    expect(list).toHaveBeenCalledWith('valid', {
      accountingPeriodId: batch.accountingPeriodId,
      limit: 20,
    });
  });

  it('generates a versioned export for a closed period', async () => {
    const generate = vi.fn(() => Promise.resolve(batch));
    const response = await app(repository({ generate })).inject({
      method: 'POST',
      url: '/api/v1/accounting-exports',
      headers: { authorization: 'Bearer valid' },
      payload: {
        accountingPeriodId: batch.accountingPeriodId,
        exportFormat: 'generic_csv',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers.etag).toBe('"1"');
    expect(generate).toHaveBeenCalledWith(
      'valid',
      batch.accountingPeriodId,
      'generic_csv',
      expect.any(String),
    );
  });

  it('marks a batch exported with optimistic locking', async () => {
    const exported = { ...batch, status: 'exported' as const, rowVersion: 2 };
    const markExported = vi.fn(() => Promise.resolve(exported));
    const response = await app(repository({ markExported })).inject({
      method: 'POST',
      url: `/api/v1/accounting-exports/${batch.id}/exported`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: { exportReference: 'freee-job-42' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).toBe('"2"');
    expect(markExported).toHaveBeenCalledWith(
      'valid',
      batch.id,
      1,
      'freee-job-42',
      expect.any(String),
    );
  });

  it('validates permissions, formats, ids, and If-Match', async () => {
    const forbidden = await app(
      repository({ canManage: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: '/api/v1/accounting-exports',
      headers: { authorization: 'Bearer valid' },
      payload: {
        accountingPeriodId: batch.accountingPeriodId,
        exportFormat: 'generic_csv',
      },
    });
    expect(forbidden.statusCode).toBe(403);

    const invalidFormat = await app().inject({
      method: 'POST',
      url: '/api/v1/accounting-exports',
      headers: { authorization: 'Bearer valid' },
      payload: {
        accountingPeriodId: batch.accountingPeriodId,
        exportFormat: 'unknown',
      },
    });
    expect(invalidFormat.statusCode).toBe(400);

    const missingVersion = await app().inject({
      method: 'POST',
      url: `/api/v1/accounting-exports/${batch.id}/exported`,
      headers: { authorization: 'Bearer valid' },
      payload: { exportReference: null },
    });
    expect(missingVersion.statusCode).toBe(428);
  });
});
