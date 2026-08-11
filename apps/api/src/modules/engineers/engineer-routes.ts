import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  AvailabilityStatus,
  EngineerRepository,
  EngineerStatus,
  EngineerInput,
  EngineerPrivateInput,
  EngineerAffiliationInput,
  EngineerPreferenceInput,
  EngineerSkillInput,
  EngineerQualificationInput,
  EngineerCareerHistoryInput,
  EngineerResumeVersionInput,
} from './engineer-repository.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set<EngineerStatus>([
  'candidate',
  'active',
  'inactive',
  'retired',
  'blocked',
]);
const availabilityStatuses = new Set<AvailabilityStatus>([
  'unknown',
  'available',
  'proposed',
  'engaged',
  'unavailable',
]);

export function registerEngineerRoutes(
  app: FastifyInstance,
  repository: EngineerRepository,
) {
  app.get(
    '/api/v1/engineers/:id/career-histories',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      return {
        items: await repository.listCareerHistories(
          request.user.accessToken,
          id,
        ),
      };
    },
  );
  app.put(
    '/api/v1/engineers/:id/career-histories/:itemId',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id, itemId } = request.params as { id: string; itemId: string };
      if (!uuid.test(id) || (itemId !== 'new' && !uuid.test(itemId)))
        throw invalid('id is invalid');
      const version =
        itemId === 'new'
          ? parsePrivateIfMatch(request.headers['if-match'])
          : parseIfMatch(request.headers['if-match']);
      await requireManage(repository, request.user.accessToken);
      const saved = await repository.saveCareerHistory(
        request.user.accessToken,
        id,
        itemId === 'new' ? null : itemId,
        version,
        parseCareerInput(request.body),
        request.id,
      );
      if (!saved)
        throw new ApiError(
          409,
          'conflict',
          'Career history was changed; reload and try again',
        );
      return reply.header('etag', `"${saved.rowVersion}"`).send(saved);
    },
  );
  app.get(
    '/api/v1/engineers/:id/resumes',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      return {
        items: await repository.listResumes(request.user.accessToken, id),
      };
    },
  );
  app.post(
    '/api/v1/engineers/:id/resumes/:resumeId/versions',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id, resumeId } = request.params as {
        id: string;
        resumeId: string;
      };
      if (!uuid.test(id) || (resumeId !== 'new' && !uuid.test(resumeId)))
        throw invalid('id is invalid');
      const version =
        resumeId === 'new'
          ? parsePrivateIfMatch(request.headers['if-match'])
          : parseIfMatch(request.headers['if-match']);
      await requireManage(repository, request.user.accessToken);
      const saved = await repository.addResumeVersion(
        request.user.accessToken,
        id,
        resumeId === 'new' ? null : resumeId,
        version,
        parseResumeVersionInput(request.body),
        request.id,
      );
      if (!saved)
        throw new ApiError(
          409,
          'conflict',
          'Resume was changed; reload and try again',
        );
      return reply
        .code(201)
        .header('etag', `"${saved.rowVersion}"`)
        .send(saved);
    },
  );
  app.get(
    '/api/v1/engineers/:id/skills',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      return {
        items: await repository.listSkills(request.user.accessToken, id),
      };
    },
  );
  app.put(
    '/api/v1/engineers/:id/skills/:itemId',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id, itemId } = request.params as { id: string; itemId: string };
      if (!uuid.test(id) || (itemId !== 'new' && !uuid.test(itemId)))
        throw invalid('id is invalid');
      const version =
        itemId === 'new'
          ? parsePrivateIfMatch(request.headers['if-match'])
          : parseIfMatch(request.headers['if-match']);
      const input = parseSkillInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const saved = await repository.saveSkill(
        request.user.accessToken,
        id,
        itemId === 'new' ? null : itemId,
        version,
        input,
        request.id,
      );
      if (!saved)
        throw new ApiError(
          409,
          'conflict',
          'Skill was changed; reload and try again',
        );
      return reply.header('etag', `"${saved.rowVersion}"`).send(saved);
    },
  );
  app.get(
    '/api/v1/engineers/:id/qualifications',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      return {
        items: await repository.listQualifications(
          request.user.accessToken,
          id,
        ),
      };
    },
  );
  app.put(
    '/api/v1/engineers/:id/qualifications/:itemId',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id, itemId } = request.params as { id: string; itemId: string };
      if (!uuid.test(id) || (itemId !== 'new' && !uuid.test(itemId)))
        throw invalid('id is invalid');
      const version =
        itemId === 'new'
          ? parsePrivateIfMatch(request.headers['if-match'])
          : parseIfMatch(request.headers['if-match']);
      const input = parseQualificationInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const saved = await repository.saveQualification(
        request.user.accessToken,
        id,
        itemId === 'new' ? null : itemId,
        version,
        input,
        request.id,
      );
      if (!saved)
        throw new ApiError(
          409,
          'conflict',
          'Qualification was changed; reload and try again',
        );
      return reply.header('etag', `"${saved.rowVersion}"`).send(saved);
    },
  );
  app.get(
    '/api/v1/engineers/:id/preferences',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      return {
        items: await repository.listPreferences(request.user.accessToken, id),
      };
    },
  );
  app.put(
    '/api/v1/engineers/:id/preferences/:preferenceId',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id, preferenceId } = request.params as {
        id: string;
        preferenceId: string;
      };
      if (
        !uuid.test(id) ||
        (preferenceId !== 'new' && !uuid.test(preferenceId))
      )
        throw invalid('id is invalid');
      const rowVersion =
        preferenceId === 'new'
          ? parsePrivateIfMatch(request.headers['if-match'])
          : parseIfMatch(request.headers['if-match']);
      const input = parsePreferenceInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const saved = await repository.savePreference(
        request.user.accessToken,
        id,
        preferenceId === 'new' ? null : preferenceId,
        rowVersion,
        input,
        request.id,
      );
      if (!saved)
        throw new ApiError(
          409,
          'conflict',
          'Preference was changed; reload and try again',
        );
      return reply.header('etag', `"${saved.rowVersion}"`).send(saved);
    },
  );
  app.get(
    '/api/v1/engineers/:id/affiliations',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      return {
        items: await repository.listAffiliations(request.user.accessToken, id),
      };
    },
  );
  app.put(
    '/api/v1/engineers/:id/affiliations/:affiliationId',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id, affiliationId } = request.params as {
        id: string;
        affiliationId: string;
      };
      if (
        !uuid.test(id) ||
        (affiliationId !== 'new' && !uuid.test(affiliationId))
      )
        throw invalid('id is invalid');
      const rowVersion =
        affiliationId === 'new'
          ? parsePrivateIfMatch(request.headers['if-match'])
          : parseIfMatch(request.headers['if-match']);
      const input = parseAffiliationInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const saved = await repository.saveAffiliation(
        request.user.accessToken,
        id,
        affiliationId === 'new' ? null : affiliationId,
        rowVersion,
        input,
        request.id,
      );
      if (!saved)
        throw new ApiError(
          409,
          'conflict',
          'Affiliation was changed; reload and try again',
        );
      return reply.header('etag', `"${saved.rowVersion}"`).send(saved);
    },
  );
  app.get(
    '/api/v1/engineers/:id/private',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      if (!(await repository.canReadPrivate(request.user.accessToken)))
        throw new ApiError(
          403,
          'forbidden',
          'engineer.private.read permission is required',
        );
      const detail = await repository.findPrivate(request.user.accessToken, id);
      if (!detail)
        return reply.code(404).send({
          error: {
            code: 'not_found',
            message: 'Engineer private detail was not found',
            requestId: request.id,
          },
        });
      return reply.header('etag', `"${detail.rowVersion}"`).send(detail);
    },
  );
  app.put(
    '/api/v1/engineers/:id/private',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parsePrivateIfMatch(request.headers['if-match']);
      const input = parsePrivateInput(request.body);
      if (!(await repository.canManagePrivate(request.user.accessToken)))
        throw new ApiError(
          403,
          'forbidden',
          'engineer.private.manage permission is required',
        );
      const detail = await repository.savePrivate(
        request.user.accessToken,
        id,
        rowVersion,
        input,
        request.id,
      );
      if (!detail)
        throw new ApiError(
          409,
          'conflict',
          'Private detail was changed; reload and try again',
        );
      return reply.header('etag', `"${detail.rowVersion}"`).send(detail);
    },
  );
  app.post(
    '/api/v1/engineers',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const input = parseInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const engineer = await repository.create(request.user.accessToken, input);
      return reply
        .code(201)
        .header('etag', `"${engineer.rowVersion}"`)
        .send(engineer);
    },
  );
  app.put(
    '/api/v1/engineers/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const engineer = await repository.update(
        request.user.accessToken,
        id,
        rowVersion,
        input,
      );
      if (!engineer)
        throw new ApiError(
          409,
          'conflict',
          'Engineer was changed; reload and try again',
        );
      return reply.header('etag', `"${engineer.rowVersion}"`).send(engineer);
    },
  );
  app.delete(
    '/api/v1/engineers/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const reason = parseDeleteReason(request.body);
      await requireManage(repository, request.user.accessToken);
      const deleted = await repository.softDelete(
        request.user.accessToken,
        id,
        rowVersion,
        reason,
        request.id,
      );
      if (!deleted)
        throw new ApiError(
          409,
          'conflict',
          'Engineer was changed or is unavailable; reload and try again',
        );
      return reply.code(204).send();
    },
  );
  app.get(
    '/api/v1/engineers/:id/audit',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      if (!(await repository.canReadAudit(request.user.accessToken)))
        throw new ApiError(
          403,
          'forbidden',
          'audit.read permission is required',
        );
      return {
        items: await repository.listAudit(request.user.accessToken, id),
      };
    },
  );
  app.get(
    '/api/v1/engineers',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw invalid('limit must be an integer between 1 and 200');
      if (
        query.q !== undefined &&
        (typeof query.q !== 'string' ||
          query.q.trim().length < 1 ||
          query.q.length > 100)
      )
        throw invalid('q must be between 1 and 100 characters');
      if (
        query.status !== undefined &&
        (typeof query.status !== 'string' ||
          !statuses.has(query.status as EngineerStatus))
      )
        throw invalid('status is invalid');
      if (
        query.availabilityStatus !== undefined &&
        (typeof query.availabilityStatus !== 'string' ||
          !availabilityStatuses.has(
            query.availabilityStatus as AvailabilityStatus,
          ))
      )
        throw invalid('availabilityStatus is invalid');
      const cursor = parseCursor(query.cursor);
      await requireRead(repository, request.user.accessToken);
      const result = await repository.list(request.user.accessToken, {
        limit,
        ...(typeof query.q === 'string' ? { q: query.q.trim() } : {}),
        ...(typeof query.status === 'string'
          ? { status: query.status as EngineerStatus }
          : {}),
        ...(typeof query.availabilityStatus === 'string'
          ? {
              availabilityStatus:
                query.availabilityStatus as AvailabilityStatus,
            }
          : {}),
        ...(cursor ? { cursor } : {}),
      });
      return {
        items: result.items,
        page: {
          limit,
          nextCursor: result.nextCursor
            ? Buffer.from(JSON.stringify(result.nextCursor)).toString(
                'base64url',
              )
            : null,
        },
      };
    },
  );
  app.get(
    '/api/v1/engineers/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuid.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      const engineer = await repository.findById(request.user.accessToken, id);
      if (!engineer)
        throw new ApiError(404, 'not_found', 'Engineer was not found');
      return engineer;
    },
  );
}

function parseSkillInput(body: unknown): EngineerSkillInput {
  if (!body || typeof body !== 'object') throw invalid('skill is invalid');
  const b = body as Record<string, unknown>;
  if (
    typeof b.skillId !== 'string' ||
    !uuid.test(b.skillId) ||
    (b.experienceMonths !== null &&
      (!Number.isInteger(b.experienceMonths) ||
        Number(b.experienceMonths) < 0)) ||
    (b.proficiencyLevel !== null &&
      (!Number.isInteger(b.proficiencyLevel) ||
        Number(b.proficiencyLevel) < 1 ||
        Number(b.proficiencyLevel) > 5)) ||
    typeof b.verificationStatus !== 'string' ||
    typeof b.isPrimary !== 'boolean'
  )
    throw invalid('skill is invalid');
  return b as unknown as EngineerSkillInput;
}
function parseCareerInput(body: unknown): EngineerCareerHistoryInput {
  if (!body || typeof body !== 'object')
    throw invalid('career history is invalid');
  const b = body as Record<string, unknown>;
  if (
    typeof b.projectName !== 'string' ||
    b.projectName.trim().length < 1 ||
    b.projectName.length > 300 ||
    !Number.isInteger(b.displayOrder)
  )
    throw invalid('career history is invalid');
  for (const k of [
    'clientName',
    'roleName',
    'industry',
    'overview',
    'responsibilities',
    'achievements',
    'startedOn',
    'endedOn',
    'sourceResumeVersionId',
  ])
    if (b[k] !== null && typeof b[k] !== 'string')
      throw invalid('career history is invalid');
  if (
    b.teamSize !== null &&
    (!Number.isInteger(b.teamSize) || Number(b.teamSize) < 0)
  )
    throw invalid('career history is invalid');
  const startedOn = b.startedOn as string | null;
  const endedOn = b.endedOn as string | null;
  const sourceResumeVersionId = b.sourceResumeVersionId as string | null;
  if (startedOn && endedOn && endedOn < startedOn)
    throw invalid('career history is invalid');
  if (sourceResumeVersionId && !uuid.test(sourceResumeVersionId))
    throw invalid('career history is invalid');
  return b as unknown as EngineerCareerHistoryInput;
}
function parseResumeVersionInput(body: unknown): EngineerResumeVersionInput {
  if (!body || typeof body !== 'object')
    throw invalid('resume version is invalid');
  const b = body as Record<string, unknown>;
  if (
    typeof b.title !== 'string' ||
    b.title.trim().length < 1 ||
    b.title.length > 300 ||
    typeof b.resumeStatus !== 'string' ||
    !['draft', 'active', 'archived'].includes(b.resumeStatus) ||
    typeof b.sourceType !== 'string' ||
    !['upload', 'manual', 'migration', 'generated'].includes(b.sourceType)
  )
    throw invalid('resume version is invalid');
  for (const k of [
    'fileStoragePath',
    'originalFileName',
    'mimeType',
    'fileChecksum',
  ])
    if (b[k] !== null && typeof b[k] !== 'string')
      throw invalid('resume version is invalid');
  if (
    b.fileSizeBytes !== null &&
    (!Number.isInteger(b.fileSizeBytes) || Number(b.fileSizeBytes) < 0)
  )
    throw invalid('resume version is invalid');
  return b as unknown as EngineerResumeVersionInput;
}
function parseQualificationInput(body: unknown): EngineerQualificationInput {
  if (!body || typeof body !== 'object')
    throw invalid('qualification is invalid');
  const b = body as Record<string, unknown>;
  if (
    typeof b.name !== 'string' ||
    b.name.trim().length < 1 ||
    b.name.length > 200
  )
    throw invalid('qualification is invalid');
  for (const k of [
    'issuer',
    'credentialId',
    'acquiredOn',
    'expiresOn',
    'notes',
  ])
    if (b[k] !== null && typeof b[k] !== 'string')
      throw invalid('qualification is invalid');
  const acquiredOn = b.acquiredOn as string | null;
  const expiresOn = b.expiresOn as string | null;
  if (acquiredOn && expiresOn && expiresOn < acquiredOn)
    throw invalid('qualification is invalid');
  return b as unknown as EngineerQualificationInput;
}
function parsePreferenceInput(body: unknown): EngineerPreferenceInput {
  if (!body || typeof body !== 'object') throw invalid('preference is invalid');
  const b = body as Record<string, unknown>;
  const remotes = new Set(['onsite', 'hybrid', 'remote', 'flexible']);
  const strings = (v: unknown) =>
    Array.isArray(v) &&
    v.every((x) => typeof x === 'string' && x.trim() !== '');
  if (
    typeof b.effectiveFrom !== 'string' ||
    (b.effectiveTo !== null && typeof b.effectiveTo !== 'string') ||
    !remotes.has(String(b.remotePreference)) ||
    !strings(b.locations) ||
    !strings(b.contractTypes)
  )
    throw invalid('preference is invalid');
  const minRate = b.desiredRateMin as number | null;
  const maxRate = b.desiredRateMax as number | null;
  const minDays = b.weeklyDaysMin as number | null;
  const maxDays = b.weeklyDaysMax as number | null;
  const allowedContracts = new Set([
    'employee',
    'dispatch',
    'quasi委任',
    'contract',
    'freelance',
    'other',
  ]);
  if (
    (minRate !== null && maxRate !== null && maxRate < minRate) ||
    (minDays !== null &&
      (minDays > 7 || (maxDays !== null && maxDays < minDays))) ||
    (maxDays !== null && maxDays > 7) ||
    (b.contractTypes as string[]).some((value) => !allowedContracts.has(value))
  )
    throw invalid('preference is invalid');
  const nullableNumber = (v: unknown) =>
    v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
  if (
    ![
      b.desiredRateMin,
      b.desiredRateMax,
      b.weeklyDaysMin,
      b.weeklyDaysMax,
      b.overtimeLimitHours,
    ].every(nullableNumber)
  )
    throw invalid('preference is invalid');
  if (
    typeof b.currencyCode !== 'string' ||
    (b.availableFrom !== null && typeof b.availableFrom !== 'string') ||
    (b.notes !== null && typeof b.notes !== 'string') ||
    (b.effectiveTo && b.effectiveTo < b.effectiveFrom)
  )
    throw invalid('preference is invalid');
  return b as unknown as EngineerPreferenceInput;
}
function parseAffiliationInput(value: unknown): EngineerAffiliationInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const b = value as Record<string, unknown>;
  const types = new Set([
    'employee',
    'freelance',
    'partner_employee',
    'subcontractor',
    'other',
  ]);
  if (
    typeof b.companyId !== 'string' ||
    !uuid.test(b.companyId) ||
    typeof b.affiliationType !== 'string' ||
    !types.has(b.affiliationType) ||
    typeof b.startDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(b.startDate) ||
    typeof b.isPrimary !== 'boolean'
  )
    throw invalid('affiliation is invalid');
  const nullable = (name: string, max: number) =>
    b[name] === null || b[name] === undefined || b[name] === ''
      ? null
      : typeof b[name] === 'string' && b[name].length <= max
        ? b[name].trim()
        : (() => {
            throw invalid(`${name} is invalid`);
          })();
  const endDate = nullable('endDate', 10);
  if (
    endDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < b.startDate)
  )
    throw invalid('endDate is invalid');
  return {
    companyId: b.companyId,
    affiliationType:
      b.affiliationType as EngineerAffiliationInput['affiliationType'],
    contractType: nullable('contractType', 100),
    startDate: b.startDate,
    endDate,
    isPrimary: b.isPrimary,
    notes: nullable('notes', 2000),
  };
}
function parsePrivateIfMatch(value: string | undefined) {
  const match = value?.match(/^(?:W\/)?"(0|[1-9]\d*)"$/);
  if (!match)
    throw new ApiError(428, 'precondition_required', 'If-Match is required');
  return Number(match[1]);
}
function parsePrivateInput(value: unknown): EngineerPrivateInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  const nullable = (name: string, max: number) => {
    const v = body[name];
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'string' || v.length > max)
      throw invalid(`${name} is invalid`);
    return v.trim();
  };
  const birthDate = nullable('birthDate', 10);
  if (
    birthDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
      Number.isNaN(Date.parse(`${birthDate}T00:00:00Z`)))
  )
    throw invalid('birthDate is invalid');
  const gender = nullable('gender', 11);
  if (gender && !['male', 'female', 'other', 'undisclosed'].includes(gender))
    throw invalid('gender is invalid');
  const personalEmail = nullable('personalEmail', 320);
  if (personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail))
    throw invalid('personalEmail is invalid');
  return {
    birthDate,
    gender: gender as EngineerPrivateInput['gender'],
    personalEmail,
    phone: nullable('phone', 50),
    postalCode: nullable('postalCode', 8),
    prefecture: nullable('prefecture', 100),
    city: nullable('city', 200),
    addressLine: nullable('addressLine', 500),
    emergencyContact: nullable('emergencyContact', 500),
    notes: nullable('notes', 2000),
  };
}
async function requireManage(repository: EngineerRepository, token: string) {
  if (!(await repository.canManage(token)))
    throw new ApiError(
      403,
      'forbidden',
      'engineer.manage permission is required',
    );
}
function parseInput(value: unknown): EngineerInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  const required = (name: string, max: number) => {
    const item = body[name];
    if (typeof item !== 'string' || item.trim().length < 1 || item.length > max)
      throw invalid(`${name} is invalid`);
    return item.trim();
  };
  const nullable = (name: string, max: number) => {
    const item = body[name];
    if (item === null || item === undefined || item === '') return null;
    if (typeof item !== 'string' || item.length > max)
      throw invalid(`${name} is invalid`);
    return item.trim();
  };
  if (
    typeof body.status !== 'string' ||
    !statuses.has(body.status as EngineerStatus)
  )
    throw invalid('status is invalid');
  if (
    typeof body.availabilityStatus !== 'string' ||
    !availabilityStatuses.has(body.availabilityStatus as AvailabilityStatus)
  )
    throw invalid('availabilityStatus is invalid');
  const availableFrom = nullable('availableFrom', 10);
  if (availableFrom && !/^\d{4}-\d{2}-\d{2}$/.test(availableFrom))
    throw invalid('availableFrom is invalid');
  return {
    managementNo: required('managementNo', 32),
    familyName: required('familyName', 100),
    givenName: required('givenName', 100),
    displayName: nullable('displayName', 200),
    status: body.status as EngineerStatus,
    availabilityStatus: body.availabilityStatus as AvailabilityStatus,
    availableFrom,
    nearestStation: nullable('nearestStation', 200),
    summary: nullable('summary', 2000),
  };
}
function parseIfMatch(value: string | undefined) {
  const match = value?.match(/^(?:W\/)?"([1-9]\d*)"$/);
  if (!match)
    throw new ApiError(428, 'precondition_required', 'If-Match is required');
  return Number(match[1]);
}
function parseDeleteReason(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const reason = (value as Record<string, unknown>).reason;
  if (
    typeof reason !== 'string' ||
    reason.trim().length < 1 ||
    reason.length > 500
  )
    throw invalid('reason must be between 1 and 500 characters');
  return reason.trim();
}
async function requireRead(repository: EngineerRepository, token: string) {
  if (!(await repository.canRead(token)))
    throw new ApiError(
      403,
      'forbidden',
      'engineer.read permission is required',
    );
}
function parseCursor(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw invalid('cursor is invalid');
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString(),
    ) as Record<string, unknown>;
    if (
      typeof parsed.updatedAt !== 'string' ||
      typeof parsed.id !== 'string' ||
      !uuid.test(parsed.id) ||
      Number.isNaN(Date.parse(parsed.updatedAt))
    )
      throw new Error();
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    throw invalid('cursor is invalid');
  }
}
function invalid(message: string) {
  return new ApiError(400, 'invalid_request', message);
}
