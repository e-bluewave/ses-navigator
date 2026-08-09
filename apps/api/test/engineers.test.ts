import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { EngineerRepository } from '../src/modules/engineers/engineer-repository.js';

const engineer = {
  id: '11111111-1111-4111-8111-111111111111',
  managementNo: 'EN-000001',
  familyName: '青波',
  givenName: '太郎',
  displayName: '青波 太郎',
  status: 'active' as const,
  availabilityStatus: 'available' as const,
  availableFrom: '2026-09-01',
  nearestStation: '東京',
  summary: 'TypeScriptエンジニア',
  updatedAt: '2026-08-09T00:00:00Z',
  rowVersion: 1,
};
const privateDetail = {
  engineerId: engineer.id,
  birthDate: '1990-01-01',
  gender: 'undisclosed' as const,
  personalEmail: 'engineer@example.com',
  phone: '090-0000-0000',
  postalCode: '100-0001',
  prefecture: '東京都',
  city: '千代田区',
  addressLine: null,
  emergencyContact: null,
  notes: null,
  updatedAt: '2026-08-09T00:00:00Z',
  rowVersion: 1,
};
function repository(
  overrides: Partial<EngineerRepository> = {},
): EngineerRepository {
  return {
    canRead: vi.fn(() => Promise.resolve(true)),
    canManage: vi.fn(() => Promise.resolve(true)),
    canReadAudit: vi.fn(() => Promise.resolve(true)),
    canReadPrivate: vi.fn(() => Promise.resolve(true)),
    canManagePrivate: vi.fn(() => Promise.resolve(true)),
    list: vi.fn(() => Promise.resolve({ items: [engineer], nextCursor: null })),
    findById: vi.fn(() => Promise.resolve(engineer)),
    create: vi.fn(() => Promise.resolve(engineer)),
    update: vi.fn(() => Promise.resolve({ ...engineer, rowVersion: 2 })),
    softDelete: vi.fn(() => Promise.resolve(true)),
    listAudit: vi.fn(() =>
      Promise.resolve([
        {
          id: '22222222-2222-4222-8222-222222222222',
          occurredAt: '2026-08-09T01:00:00Z',
          actorUserId: 'user-1',
          action: 'engineer.soft_deleted',
          requestId: 'request-1',
        },
      ]),
    ),
    findPrivate: vi.fn(() => Promise.resolve(privateDetail)),
    savePrivate: vi.fn(() =>
      Promise.resolve({ ...privateDetail, rowVersion: 2 }),
    ),
    listAffiliations: vi.fn(() => Promise.resolve([])),
    saveAffiliation: vi.fn(() => Promise.resolve(null)),
    listPreferences: vi.fn(() => Promise.resolve([])),
    savePreference: vi.fn(() => Promise.resolve(null)),
    listSkills: vi.fn(() => Promise.resolve([])),
    saveSkill: vi.fn(() => Promise.resolve(null)),
    listQualifications: vi.fn(() => Promise.resolve([])),
    saveQualification: vi.fn(() => Promise.resolve(null)),
    listCareerHistories: vi.fn(() => Promise.resolve([])),
    saveCareerHistory: vi.fn(() => Promise.resolve(null)),
    listResumes: vi.fn(() => Promise.resolve([])),
    addResumeVersion: vi.fn(() => Promise.resolve(null)),
    ...overrides,
  };
}
const apps: ReturnType<typeof buildApp>[] = [];
function app(engineers = repository()) {
  const value = buildApp({
    authentication: {
      authenticate: vi.fn(() =>
        Promise.resolve({ id: 'user-1', accessToken: 'valid' }),
      ),
    },
    engineers,
  });
  apps.push(value);
  return value;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((value) => value.close()));
});

describe('engineer skill and qualification API', () => {
  it('lists skills and saves a skill with optimistic locking', async () => {
    const listSkills = vi.fn(() =>
      Promise.resolve([
        {
          id: '22222222-2222-4222-8222-222222222222',
          engineerId: engineer.id,
          skillId: '33333333-3333-4333-8333-333333333333',
          skillName: 'TypeScript',
          experienceMonths: 36,
          proficiencyLevel: 4,
          lastUsedOn: null,
          evidenceType: 'resume',
          evidenceNote: null,
          verificationStatus: 'reviewed',
          isPrimary: true,
          updatedAt: engineer.updatedAt,
          rowVersion: 1,
        },
      ]),
    );
    const a = app(
      repository({
        listSkills,
        saveSkill: vi.fn(async () => (await listSkills())[0]!),
      }),
    );
    expect(
      (
        await a.inject({
          method: 'GET',
          url: `/api/v1/engineers/${engineer.id}/skills`,
          headers: { authorization: 'Bearer valid' },
        })
      ).statusCode,
    ).toBe(200);
    const response = await a.inject({
      method: 'PUT',
      url: `/api/v1/engineers/${engineer.id}/skills/new`,
      headers: { authorization: 'Bearer valid', 'if-match': '"0"' },
      payload: {
        skillId: '33333333-3333-4333-8333-333333333333',
        experienceMonths: 36,
        proficiencyLevel: 4,
        lastUsedOn: null,
        evidenceType: 'resume',
        evidenceNote: null,
        verificationStatus: 'reviewed',
        isPrimary: true,
      },
    });
    expect(response.statusCode).toBe(200);
  });
  it('lists qualifications and validates expiration order', async () => {
    const a = app(
      repository({ listQualifications: vi.fn(() => Promise.resolve([])) }),
    );
    expect(
      (
        await a.inject({
          method: 'GET',
          url: `/api/v1/engineers/${engineer.id}/qualifications`,
          headers: { authorization: 'Bearer valid' },
        })
      ).statusCode,
    ).toBe(200);
    const response = await a.inject({
      method: 'PUT',
      url: `/api/v1/engineers/${engineer.id}/qualifications/new`,
      headers: { authorization: 'Bearer valid', 'if-match': '"0"' },
      payload: {
        name: 'AWS Certified',
        issuer: 'AWS',
        credentialId: null,
        acquiredOn: '2026-08-01',
        expiresOn: '2025-08-01',
        notes: null,
      },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('engineer career and resume API', () => {
  it('lists and saves career histories with optimistic locking', async () => {
    const item = {
      id: '22222222-2222-4222-8222-222222222222',
      engineerId: engineer.id,
      projectName: '販売管理刷新',
      clientName: null,
      roleName: 'SE',
      industry: null,
      overview: null,
      responsibilities: '設計・実装',
      achievements: null,
      teamSize: 5,
      startedOn: '2025-01-01',
      endedOn: '2025-12-31',
      displayOrder: 1,
      sourceResumeVersionId: null,
      updatedAt: engineer.updatedAt,
      rowVersion: 1,
    };
    const a = app(
      repository({
        listCareerHistories: vi.fn(() => Promise.resolve([item])),
        saveCareerHistory: vi.fn(() => Promise.resolve(item)),
      }),
    );
    expect(
      (
        await a.inject({
          method: 'GET',
          url: `/api/v1/engineers/${engineer.id}/career-histories`,
          headers: { authorization: 'Bearer valid' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await a.inject({
          method: 'PUT',
          url: `/api/v1/engineers/${engineer.id}/career-histories/new`,
          headers: { authorization: 'Bearer valid', 'if-match': '"0"' },
          payload: {
            projectName: item.projectName,
            clientName: null,
            roleName: 'SE',
            industry: null,
            overview: null,
            responsibilities: item.responsibilities,
            achievements: null,
            teamSize: 5,
            startedOn: '2025-01-01',
            endedOn: '2025-12-31',
            displayOrder: 1,
            sourceResumeVersionId: null,
          },
        })
      ).statusCode,
    ).toBe(200);
  });
  it('lists resumes, adds an immutable version, and validates file size', async () => {
    const resume = {
      id: '33333333-3333-4333-8333-333333333333',
      engineerId: engineer.id,
      title: '職務経歴書',
      resumeStatus: 'active',
      currentVersionId: '44444444-4444-4444-8444-444444444444',
      updatedAt: engineer.updatedAt,
      rowVersion: 2,
      versions: [],
    };
    const a = app(
      repository({
        listResumes: vi.fn(() => Promise.resolve([resume])),
        addResumeVersion: vi.fn(() => Promise.resolve(resume)),
      }),
    );
    expect(
      (
        await a.inject({
          method: 'GET',
          url: `/api/v1/engineers/${engineer.id}/resumes`,
          headers: { authorization: 'Bearer valid' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await a.inject({
          method: 'POST',
          url: `/api/v1/engineers/${engineer.id}/resumes/new/versions`,
          headers: { authorization: 'Bearer valid', 'if-match': '"0"' },
          payload: {
            title: '職務経歴書',
            resumeStatus: 'active',
            fileStoragePath: 'tenant/engineer/resume.pdf',
            originalFileName: 'resume.pdf',
            mimeType: 'application/pdf',
            fileSizeBytes: 1024,
            fileChecksum: 'sha256:abc',
            sourceType: 'upload',
          },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await a.inject({
          method: 'POST',
          url: `/api/v1/engineers/${engineer.id}/resumes/new/versions`,
          headers: { authorization: 'Bearer valid', 'if-match': '"0"' },
          payload: {
            title: '職務経歴書',
            resumeStatus: 'active',
            fileStoragePath: null,
            originalFileName: null,
            mimeType: null,
            fileSizeBytes: -1,
            fileChecksum: null,
            sourceType: 'manual',
          },
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe('engineer write API', () => {
  const input = {
    managementNo: 'EN-000001',
    familyName: '青波',
    givenName: '太郎',
    displayName: '青波 太郎',
    status: 'active',
    availabilityStatus: 'available',
    availableFrom: '2026-09-01',
    nearestStation: '東京',
    summary: 'TypeScript',
  };
  it('creates and updates public engineer master data', async () => {
    const created = await app().inject({
      method: 'POST',
      url: '/api/v1/engineers',
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(created.statusCode).toBe(201);
    const updated = await app().inject({
      method: 'PUT',
      url: `/api/v1/engineers/${engineer.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: input,
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.headers.etag).toBe('"2"');
  });
  it('enforces manage permission and optimistic locking', async () => {
    const denied = await app(
      repository({ canManage: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'POST',
      url: '/api/v1/engineers',
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(denied.statusCode).toBe(403);
    const missing = await app().inject({
      method: 'PUT',
      url: `/api/v1/engineers/${engineer.id}`,
      headers: { authorization: 'Bearer valid' },
      payload: input,
    });
    expect(missing.statusCode).toBe(428);
    const conflict = await app(
      repository({ update: vi.fn(() => Promise.resolve(null)) }),
    ).inject({
      method: 'PUT',
      url: `/api/v1/engineers/${engineer.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: input,
    });
    expect(conflict.statusCode).toBe(409);
  });
  it('soft-deletes with a reason and exposes authorized audit summaries', async () => {
    const softDelete = vi.fn(() => Promise.resolve(true));
    const engineers = repository({ softDelete });
    const deleted = await app(engineers).inject({
      method: 'DELETE',
      url: `/api/v1/engineers/${engineer.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: { reason: '重複登録のため' },
    });
    expect(deleted.statusCode).toBe(204);
    expect(softDelete).toHaveBeenCalledWith(
      'valid',
      engineer.id,
      1,
      '重複登録のため',
      expect.any(String),
    );
    const audit = await app(engineers).inject({
      method: 'GET',
      url: `/api/v1/engineers/${engineer.id}/audit`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json<{ items: { action: string }[] }>().items[0]?.action).toBe(
      'engineer.soft_deleted',
    );
  });
  it('validates deletion and enforces audit.read', async () => {
    const invalid = await app().inject({
      method: 'DELETE',
      url: `/api/v1/engineers/${engineer.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: { reason: '' },
    });
    expect(invalid.statusCode).toBe(400);
    const conflict = await app(
      repository({ softDelete: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'DELETE',
      url: `/api/v1/engineers/${engineer.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: { reason: '退職' },
    });
    expect(conflict.statusCode).toBe(409);
    const auditDenied = await app(
      repository({ canReadAudit: vi.fn(() => Promise.resolve(false)) }),
    ).inject({
      method: 'GET',
      url: `/api/v1/engineers/${engineer.id}/audit`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(auditDenied.statusCode).toBe(403);
  });
});

describe('engineer private detail API', () => {
  const input = {
    birthDate: '1990-01-01',
    gender: 'undisclosed',
    personalEmail: 'engineer@example.com',
    phone: null,
    postalCode: null,
    prefecture: '東京都',
    city: null,
    addressLine: null,
    emergencyContact: null,
    notes: null,
  };
  it('reads and version-updates private data behind dedicated permissions', async () => {
    const detail = await app().inject({
      method: 'GET',
      url: `/api/v1/engineers/${engineer.id}/private`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.headers.etag).toBe('"1"');
    expect(detail.json()).not.toHaveProperty('createdBy');
    const updated = await app().inject({
      method: 'PUT',
      url: `/api/v1/engineers/${engineer.id}/private`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: input,
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.headers.etag).toBe('"2"');
  });
  it('enforces private permissions, validation, and optimistic locking', async () => {
    expect(
      (
        await app(
          repository({ canReadPrivate: vi.fn(() => Promise.resolve(false)) }),
        ).inject({
          method: 'GET',
          url: `/api/v1/engineers/${engineer.id}/private`,
          headers: { authorization: 'Bearer valid' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app().inject({
          method: 'PUT',
          url: `/api/v1/engineers/${engineer.id}/private`,
          headers: { authorization: 'Bearer valid' },
          payload: input,
        })
      ).statusCode,
    ).toBe(428);
    expect(
      (
        await app(
          repository({ savePrivate: vi.fn(() => Promise.resolve(null)) }),
        ).inject({
          method: 'PUT',
          url: `/api/v1/engineers/${engineer.id}/private`,
          headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
          payload: input,
        })
      ).statusCode,
    ).toBe(409);
  });
});

describe('engineer affiliation history API', () => {
  const affiliation = {
    id: '33333333-3333-4333-8333-333333333333',
    engineerId: engineer.id,
    companyId: '44444444-4444-4444-8444-444444444444',
    affiliationType: 'employee' as const,
    contractType: '正社員',
    startDate: '2026-01-01',
    endDate: null,
    isPrimary: true,
    notes: null,
    updatedAt: '2026-08-09T00:00:00Z',
    rowVersion: 1,
  };
  it('lists and saves affiliation history with optimistic locking', async () => {
    const engineers = repository({
      listAffiliations: vi.fn(() => Promise.resolve([affiliation])),
      saveAffiliation: vi.fn(() =>
        Promise.resolve({ ...affiliation, rowVersion: 2 }),
      ),
    });
    const list = await app(engineers).inject({
      method: 'GET',
      url: `/api/v1/engineers/${engineer.id}/affiliations`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ items: [affiliation] });
    const saved = await app(engineers).inject({
      method: 'PUT',
      url: `/api/v1/engineers/${engineer.id}/affiliations/${affiliation.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: {
        companyId: affiliation.companyId,
        affiliationType: 'employee',
        contractType: '正社員',
        startDate: '2026-01-01',
        endDate: null,
        isPrimary: true,
        notes: null,
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.headers.etag).toBe('"2"');
  });
  it('rejects invalid periods and stale versions', async () => {
    const payload = {
      companyId: affiliation.companyId,
      affiliationType: 'employee',
      contractType: null,
      startDate: '2026-02-01',
      endDate: '2026-01-01',
      isPrimary: false,
      notes: null,
    };
    expect(
      (
        await app().inject({
          method: 'PUT',
          url: `/api/v1/engineers/${engineer.id}/affiliations/new`,
          headers: { authorization: 'Bearer valid', 'if-match': '"0"' },
          payload,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app().inject({
          method: 'PUT',
          url: `/api/v1/engineers/${engineer.id}/affiliations/${affiliation.id}`,
          headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
          payload: { ...payload, endDate: null },
        })
      ).statusCode,
    ).toBe(409);
  });
});

describe('engineer preference API', () => {
  const preference = {
    id: '55555555-5555-4555-8555-555555555555',
    engineerId: engineer.id,
    effectiveFrom: '2026-09-01',
    effectiveTo: null,
    desiredRateMin: 700000,
    desiredRateMax: 900000,
    currencyCode: 'JPY',
    remotePreference: 'hybrid' as const,
    weeklyDaysMin: 4,
    weeklyDaysMax: 5,
    overtimeLimitHours: 20,
    availableFrom: '2026-09-01',
    notes: null,
    locations: ['東京都'],
    contractTypes: ['freelance'],
    updatedAt: '2026-08-09T00:00:00Z',
    rowVersion: 1,
  };
  it('lists and saves preferences with optimistic locking', async () => {
    const engineers = repository({
      listPreferences: vi.fn(() => Promise.resolve([preference])),
      savePreference: vi.fn(() =>
        Promise.resolve({ ...preference, rowVersion: 2 }),
      ),
    });
    const list = await app(engineers).inject({
      method: 'GET',
      url: `/api/v1/engineers/${engineer.id}/preferences`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ items: [preference] });
    const saved = await app(engineers).inject({
      method: 'PUT',
      url: `/api/v1/engineers/${engineer.id}/preferences/${preference.id}`,
      headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
      payload: {
        ...preference,
        id: undefined,
        engineerId: undefined,
        updatedAt: undefined,
        rowVersion: undefined,
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.headers.etag).toBe('"2"');
  });
  it('rejects invalid periods and stale versions', async () => {
    const payload = {
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-08-01',
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
    expect(
      (
        await app().inject({
          method: 'PUT',
          url: `/api/v1/engineers/${engineer.id}/preferences/new`,
          headers: { authorization: 'Bearer valid', 'if-match': '"0"' },
          payload,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app().inject({
          method: 'PUT',
          url: `/api/v1/engineers/${engineer.id}/preferences/${preference.id}`,
          headers: { authorization: 'Bearer valid', 'if-match': '"1"' },
          payload: { ...payload, effectiveTo: null },
        })
      ).statusCode,
    ).toBe(409);
  });
});

describe('engineer read API', () => {
  it('lists and reads RLS-visible public engineer data', async () => {
    const listEngineers = vi.fn(() =>
      Promise.resolve({ items: [engineer], nextCursor: null }),
    );
    const engineers = repository({ list: listEngineers });
    const list = await app(engineers).inject({
      method: 'GET',
      url: '/api/v1/engineers?q=青波&status=active&availabilityStatus=available',
      headers: { authorization: 'Bearer valid' },
    });
    expect(list.statusCode).toBe(200);
    expect(
      list.json<{ items: (typeof engineer)[] }>().items[0]?.managementNo,
    ).toBe('EN-000001');
    expect(listEngineers).toHaveBeenCalledWith(
      'valid',
      expect.objectContaining({
        q: '青波',
        status: 'active',
        availabilityStatus: 'available',
      }),
    );
    const detail = await app(engineers).inject({
      method: 'GET',
      url: `/api/v1/engineers/${engineer.id}`,
      headers: { authorization: 'Bearer valid' },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).not.toHaveProperty('primaryOwnerUserId');
    expect(detail.json()).not.toHaveProperty('nameNormalized');
  });
  it('enforces engineer.read and validates filters', async () => {
    expect(
      (
        await app(
          repository({ canRead: vi.fn(() => Promise.resolve(false)) }),
        ).inject({
          method: 'GET',
          url: '/api/v1/engineers',
          headers: { authorization: 'Bearer valid' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app().inject({
          method: 'GET',
          url: '/api/v1/engineers?status=bad',
          headers: { authorization: 'Bearer valid' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app(
          repository({ findById: vi.fn(() => Promise.resolve(null)) }),
        ).inject({
          method: 'GET',
          url: `/api/v1/engineers/${engineer.id}`,
          headers: { authorization: 'Bearer valid' },
        })
      ).statusCode,
    ).toBe(404);
  });
});
