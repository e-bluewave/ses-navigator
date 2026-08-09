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
    canManage: vi.fn(() => Promise.resolve(true)),
    canReadAudit: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() => Promise.resolve({ items: [contact], nextCursor: null })),
    findById: vi.fn(() => Promise.resolve(contact)),
    create: vi.fn(() => Promise.resolve(contact)),
    update: vi.fn(() => Promise.resolve({ ...contact, rowVersion: 2 })),
    softDelete: vi.fn(() => Promise.resolve(true)),
    listAudit: vi.fn(() => Promise.resolve([])),
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
  it('creates and updates contacts with company.manage and optimistic locking', async () => {
    const body = {
      companyId: contact.companyId,
      managementNo: 'CT-001',
      familyName: '青波',
      givenName: '太郎',
      departmentName: '営業部',
      positionTitle: '部長',
      email: 'taro@example.com',
      phone: null,
      mobilePhone: null,
      isPrimary: true,
      status: 'active',
    };
    const created = await app().inject({
      method: 'POST',
      url: '/api/v1/contacts',
      headers: { authorization: 'Bearer valid' },
      payload: body,
    });
    expect(created.statusCode).toBe(201);
    expect(created.headers.etag).toBe('"1"');
    const updated = await app().inject({
      method: 'PUT',
      url: `/api/v1/contacts/${contact.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: body,
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.headers.etag).toBe('"2"');
  });
  it('enforces manage permission, validation, If-Match, and conflicts', async () => {
    const body = {
      companyId: contact.companyId,
      managementNo: 'CT-001',
      familyName: '青波',
      givenName: null,
      departmentName: null,
      positionTitle: null,
      email: null,
      phone: null,
      mobilePhone: null,
      isPrimary: false,
      status: 'active',
    };
    expect(
      (
        await app(
          repository({ canManage: vi.fn(() => Promise.resolve(false)) }),
        ).inject({
          method: 'POST',
          url: '/api/v1/contacts',
          headers: { authorization: 'Bearer valid' },
          payload: body,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app().inject({
          method: 'PUT',
          url: `/api/v1/contacts/${contact.id}`,
          headers: { authorization: 'Bearer valid' },
          payload: body,
        })
      ).statusCode,
    ).toBe(428);
    expect(
      (
        await app(
          repository({ update: vi.fn(() => Promise.resolve(null)) }),
        ).inject({
          method: 'PUT',
          url: `/api/v1/contacts/${contact.id}`,
          headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
          payload: body,
        })
      ).statusCode,
    ).toBe(409);
  });
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
  it('soft-deletes a contact and reads its audit trail', async () => {
    const softDelete = vi.fn(() => Promise.resolve(true));
    const contacts = repository({
      softDelete,
      listAudit: vi.fn(() =>
        Promise.resolve([
          {
            id: '33333333-3333-4333-8333-333333333333',
            occurredAt: '2026-08-09T06:00:00Z',
            actorUserId: null,
            action: 'company_contact.soft_deleted',
            requestId: null,
          },
        ]),
      ),
    });
    const deleted = await app(contacts).inject({
      method: 'DELETE',
      url: `/api/v1/contacts/${contact.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: { reason: '重複登録のため' },
    });
    expect(deleted.statusCode).toBe(204);
    expect(softDelete).toHaveBeenCalledWith(
      'valid',
      contact.id,
      1,
      '重複登録のため',
      expect.any(String),
    );
    const audit = await app(contacts).inject({
      method: 'GET',
      url: `/api/v1/contacts/${contact.id}/audit`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json<{ items: { action: string }[] }>().items[0]?.action).toBe(
      'company_contact.soft_deleted',
    );
  });
  it('validates contact deletion and audit permissions', async () => {
    expect(
      (
        await app().inject({
          method: 'DELETE',
          url: `/api/v1/contacts/${contact.id}`,
          headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
          payload: { reason: '' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app(
          repository({ softDelete: vi.fn(() => Promise.resolve(false)) }),
        ).inject({
          method: 'DELETE',
          url: `/api/v1/contacts/${contact.id}`,
          headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
          payload: { reason: '退職のため' },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app(
          repository({ canReadAudit: vi.fn(() => Promise.resolve(false)) }),
        ).inject({
          method: 'GET',
          url: `/api/v1/contacts/${contact.id}/audit`,
          headers: { authorization: 'Bearer valid' },
        })
      ).statusCode,
    ).toBe(403);
  });
});
