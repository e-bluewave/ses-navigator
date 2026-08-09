import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { ContactRepository } from '../src/modules/contacts/contact-repository.js';

const contact = {
  id: '22222222-2222-4222-8222-222222222222',
  companyId: '11111111-1111-4111-8111-111111111111',
  managementNo: 'CT-001',
  familyName: '青波',
  givenName: '太郎',
  departmentName: '営業部',
  positionTitle: '部長',
  email: 'taro@example.com',
  phone: null,
  mobilePhone: null,
  isPrimary: true,
  status: 'active' as const,
  updatedAt: '2026-08-09T00:00:00Z',
  rowVersion: 1,
};
function repository(
  overrides: Partial<ContactRepository> = {},
): ContactRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() => Promise.resolve({ items: [contact], nextCursor: null })),
    findById: vi.fn(() => Promise.resolve(contact)),
    ...overrides,
  };
}
const apps: ReturnType<typeof buildApp>[] = [];
function app(contacts = repository()) {
  const value = buildApp({
    authentication: {
      authenticate: vi.fn(() =>
        Promise.resolve({ id: 'user-1', accessToken: 'valid' }),
      ),
    },
    contacts,
  });
  apps.push(value);
  return value;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((value) => value.close()));
});

describe('company contact read API', () => {
  it('lists and returns contact details through company.read', async () => {
    const list = await app().inject({
      method: 'GET',
      url: '/api/v1/contacts?q=青波&status=active',
      headers: { authorization: 'Bearer valid' },
    });
    expect(list.statusCode).toBe(200);
    expect(
      list.json<{ items: (typeof contact)[] }>().items[0]?.managementNo,
    ).toBe('CT-001');
    const detail = await app().inject({
      method: 'GET',
      url: `/api/v1/contacts/${contact.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json<typeof contact>().email).toBe('taro@example.com');
  });
  it('rejects missing permission, invalid input, and RLS-hidden details', async () => {
    const forbidden = await app(
      repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: '/api/v1/contacts',
      headers: { authorization: 'Bearer valid' },
    });
    expect(forbidden.statusCode).toBe(403);
    const invalid = await app().inject({
      method: 'GET',
      url: '/api/v1/contacts?status=bad',
      headers: { authorization: 'Bearer valid' },
    });
    expect(invalid.statusCode).toBe(400);
    const hidden = await app(
      repository({ findById: vi.fn(() => Promise.resolve(null)) }),
    ).inject({
      method: 'GET',
      url: `/api/v1/contacts/${contact.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(hidden.statusCode).toBe(404);
  });
});
