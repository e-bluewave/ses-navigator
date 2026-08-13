import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../shared/errors.js';
import type {
  ContractInput,
  ContractRepository,
  ContractStatus,
} from './contract-repository.js';

const statuses = new Set<ContractStatus>([
  'draft',
  'review',
  'active',
  'suspended',
  'expired',
  'terminated',
  'cancelled',
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function registerContractRoutes(
  app: FastifyInstance,
  repository: ContractRepository,
): void {
  app.post(
    '/api/v1/contracts',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const input = parseContractInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const contract = await repository.create(
        request.user.accessToken,
        input,
        request.id,
      );
      if (!contract)
        throw new ApiError(
          409,
          'conflict',
          'Contract references are unavailable; reload and try again',
        );
      return reply
        .code(201)
        .header('etag', `"${contract.rowVersion}"`)
        .send(contract);
    },
  );

  app.put(
    '/api/v1/contracts/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const input = parseContractInput(request.body);
      await requireManage(repository, request.user.accessToken);
      const contract = await repository.update(
        request.user.accessToken,
        id,
        rowVersion,
        input,
        request.id,
      );
      if (!contract)
        throw new ApiError(
          409,
          'conflict',
          'Contract was changed, is no longer a draft, or is unavailable',
        );
      return reply.header('etag', `"${contract.rowVersion}"`).send(contract);
    },
  );

  app.post(
    '/api/v1/contracts/:id/status',
    { preHandler: (request) => app.authenticate(request) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      const rowVersion = parseIfMatch(request.headers['if-match']);
      const transition = parseStatusTransition(request.body);
      if (transition.status === 'review')
        await requireManage(repository, request.user.accessToken);
      else await requireApprove(repository, request.user.accessToken);
      const contract = await repository.transitionStatus(
        request.user.accessToken,
        id,
        rowVersion,
        transition.status,
        transition.reason,
        request.id,
      );
      if (!contract)
        throw new ApiError(
          409,
          'conflict',
          'Contract was changed or the approval transition is unavailable; reload and try again',
        );
      return reply.header('etag', `"${contract.rowVersion}"`).send(contract);
    },
  );

  app.get(
    '/api/v1/contracts',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw invalid('limit must be an integer between 1 and 200');
      if (
        query.status !== undefined &&
        (typeof query.status !== 'string' ||
          !statuses.has(query.status as ContractStatus))
      )
        throw invalid('status is invalid');
      if (
        query.q !== undefined &&
        (typeof query.q !== 'string' ||
          query.q.trim().length < 1 ||
          query.q.length > 100)
      )
        throw invalid('q must be between 1 and 100 characters');
      const cursor = parseCursor(query.cursor);
      await requireRead(repository, request.user.accessToken);
      const result = await repository.list(request.user.accessToken, {
        limit,
        ...(cursor ? { cursor } : {}),
        ...(typeof query.q === 'string' ? { query: query.q.trim() } : {}),
        ...(typeof query.status === 'string'
          ? { status: query.status as ContractStatus }
          : {}),
      });
      return {
        items: result.items,
        page: {
          limit,
          nextCursor: result.nextCursor
            ? encodeCursor(result.nextCursor)
            : null,
        },
      };
    },
  );

  app.get(
    '/api/v1/contracts/:id',
    { preHandler: (request) => app.authenticate(request) },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!uuidPattern.test(id)) throw invalid('id must be a UUID');
      await requireRead(repository, request.user.accessToken);
      const contract = await repository.findById(request.user.accessToken, id);
      if (!contract)
        throw new ApiError(404, 'not_found', 'Contract was not found');
      return contract;
    },
  );
}

function parseContractInput(value: unknown): ContractInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  const requiredText = (name: string, max: number) => {
    const item = body[name];
    if (typeof item !== 'string' || item.trim().length < 1 || item.length > max)
      throw invalid(`${name} is invalid`);
    return item.trim();
  };
  const optionalText = (name: string, max: number) => {
    const item = body[name];
    if (item === null || item === undefined || item === '') return null;
    if (typeof item !== 'string' || item.length > max)
      throw invalid(`${name} is invalid`);
    return item.trim() || null;
  };
  const optionalUuid = (name: string) => {
    const item = body[name];
    if (item === null || item === undefined || item === '') return null;
    if (typeof item !== 'string' || !uuidPattern.test(item))
      throw invalid(`${name} must be a UUID`);
    return item;
  };
  const amount = (name: string) => {
    const item = body[name];
    if (item === null || item === undefined || item === '') return null;
    if (typeof item !== 'number' || !Number.isFinite(item) || item < 0)
      throw invalid(`${name} is invalid`);
    return item;
  };
  if (
    typeof body.contractType !== 'string' ||
    ![
      'ses',
      'dispatch',
      'subcontract',
      'quasi_mandate',
      'fixed_price',
      'other',
    ].includes(body.contractType)
  )
    throw invalid('contractType is invalid');
  if (typeof body.autoRenew !== 'boolean')
    throw invalid('autoRenew must be a boolean');
  const currency = requiredText('currency', 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw invalid('currency is invalid');
  const startDate = parseDate(body.startDate, 'startDate', false)!;
  const endDate = parseDate(body.endDate, 'endDate', true);
  if (endDate !== null && endDate < startDate)
    throw invalid('endDate must not be before startDate');
  const settlementLowerHours = amount('settlementLowerHours');
  const settlementUpperHours = amount('settlementUpperHours');
  if (
    settlementLowerHours !== null &&
    settlementUpperHours !== null &&
    settlementUpperHours < settlementLowerHours
  )
    throw invalid(
      'settlementUpperHours must not be below settlementLowerHours',
    );
  if (!Array.isArray(body.parties) || body.parties.length > 20)
    throw invalid('parties must contain at most 20 items');
  const parties = body.parties.map((value, index) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw invalid(`parties[${index}] is invalid`);
    const party = value as Record<string, unknown>;
    if (
      typeof party.companyId !== 'string' ||
      !uuidPattern.test(party.companyId)
    )
      throw invalid(`parties[${index}].companyId must be a UUID`);
    if (
      typeof party.partyRole !== 'string' ||
      ![
        'customer',
        'supplier',
        'employer',
        'end_client',
        'prime_contractor',
        'subcontractor',
        'other',
      ].includes(party.partyRole)
    )
      throw invalid(`parties[${index}].partyRole is invalid`);
    if (
      party.billingRole !== null &&
      party.billingRole !== undefined &&
      (typeof party.billingRole !== 'string' ||
        !['bill_to', 'pay_to', 'none'].includes(party.billingRole))
    )
      throw invalid(`parties[${index}].billingRole is invalid`);
    if (typeof party.isPrimary !== 'boolean')
      throw invalid(`parties[${index}].isPrimary must be a boolean`);
    const contactId =
      party.contactId === null ||
      party.contactId === undefined ||
      party.contactId === ''
        ? null
        : party.contactId;
    if (
      contactId !== null &&
      (typeof contactId !== 'string' || !uuidPattern.test(contactId))
    )
      throw invalid(`parties[${index}].contactId must be a UUID`);
    return {
      companyId: party.companyId,
      contactId,
      partyRole:
        party.partyRole as ContractInput['parties'][number]['partyRole'],
      billingRole: (party.billingRole ??
        null) as ContractInput['parties'][number]['billingRole'],
      isPrimary: party.isPrimary,
    };
  });
  const uniqueParties = new Set(
    parties.map((party) => `${party.companyId}:${party.partyRole}`),
  );
  if (uniqueParties.size !== parties.length)
    throw invalid('parties must not contain duplicate company and role pairs');
  if (parties.filter((party) => party.isPrimary).length > 1)
    throw invalid('parties may contain at most one primary party');
  return {
    contractNo: requiredText('contractNo', 32),
    projectId: optionalUuid('projectId'),
    proposalId: optionalUuid('proposalId'),
    engineerId: optionalUuid('engineerId'),
    contractType: body.contractType as ContractInput['contractType'],
    title: requiredText('title', 300),
    startDate,
    endDate,
    autoRenew: body.autoRenew,
    currency,
    monthlyAmount: amount('monthlyAmount'),
    hourlyAmount: amount('hourlyAmount'),
    settlementLowerHours,
    settlementUpperHours,
    paymentTerms: optionalText('paymentTerms', 1000),
    notes: optionalText('notes', 5000),
    parties,
    changeSummary: optionalText('changeSummary', 1000),
  };
}

function parseStatusTransition(value: unknown): {
  status: 'draft' | 'review' | 'active';
  reason: string | null;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body is invalid');
  const body = value as Record<string, unknown>;
  if (
    typeof body.status !== 'string' ||
    !['draft', 'review', 'active'].includes(body.status)
  )
    throw invalid('status is invalid');
  if (
    body.reason !== null &&
    body.reason !== undefined &&
    (typeof body.reason !== 'string' || body.reason.length > 1000)
  )
    throw invalid('reason is invalid');
  const reason =
    typeof body.reason === 'string' ? body.reason.trim() || null : null;
  if (body.status === 'draft' && reason === null)
    throw invalid('reason is required when returning a contract to draft');
  return { status: body.status as 'draft' | 'review' | 'active', reason };
}

function parseDate(value: unknown, name: string, nullable: boolean) {
  if (nullable && (value === null || value === undefined || value === ''))
    return null;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  )
    throw invalid(`${name} is invalid`);
  return value;
}

function parseIfMatch(value: string | undefined): number {
  const match = value?.match(/^(?:W\/)?"([1-9]\d*)"$/);
  if (!match)
    throw new ApiError(428, 'precondition_required', 'If-Match is required');
  return Number(match[1]);
}

async function requireRead(repository: ContractRepository, token: string) {
  if (!(await repository.canRead(token)))
    throw new ApiError(
      403,
      'forbidden',
      'contract.read permission is required',
    );
}

async function requireManage(repository: ContractRepository, token: string) {
  if (!(await repository.canManage(token)))
    throw new ApiError(
      403,
      'forbidden',
      'contract.manage permission is required',
    );
}

async function requireApprove(repository: ContractRepository, token: string) {
  if (!(await repository.canApprove(token)))
    throw new ApiError(
      403,
      'forbidden',
      'contract.approve permission is required',
    );
}

function invalid(message: string) {
  return new ApiError(400, 'invalid_request', message);
}

function encodeCursor(cursor: { updatedAt: string; id: string }) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function parseCursor(
  value: unknown,
): { updatedAt: string; id: string } | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw invalid('cursor is invalid');
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    if (
      typeof parsed.updatedAt !== 'string' ||
      typeof parsed.id !== 'string' ||
      !uuidPattern.test(parsed.id)
    )
      throw new Error();
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    throw invalid('cursor is invalid');
  }
}
