import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export type EngineerStatus =
  'candidate' | 'active' | 'inactive' | 'retired' | 'blocked';
export type AvailabilityStatus =
  'unknown' | 'available' | 'proposed' | 'engaged' | 'unavailable';

export interface Engineer {
  id: string;
  managementNo: string;
  familyName: string;
  givenName: string;
  displayName: string | null;
  status: EngineerStatus;
  availabilityStatus: AvailabilityStatus;
  availableFrom: string | null;
  nearestStation: string | null;
  summary: string | null;
  updatedAt: string;
  rowVersion: number;
}
export interface EngineerInput {
  managementNo: string;
  familyName: string;
  givenName: string;
  displayName: string | null;
  status: EngineerStatus;
  availabilityStatus: AvailabilityStatus;
  availableFrom: string | null;
  nearestStation: string | null;
  summary: string | null;
}
export interface EngineerAuditEvent {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  action: string;
  requestId: string | null;
}
export type EngineerGender = 'male' | 'female' | 'other' | 'undisclosed';
export interface EngineerPrivateDetail {
  engineerId: string;
  birthDate: string | null;
  gender: EngineerGender | null;
  personalEmail: string | null;
  phone: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  addressLine: string | null;
  emergencyContact: string | null;
  notes: string | null;
  updatedAt: string;
  rowVersion: number;
}
export type EngineerPrivateInput = Omit<
  EngineerPrivateDetail,
  'engineerId' | 'updatedAt' | 'rowVersion'
>;

export interface EngineerRepository {
  canRead(token: string): Promise<boolean>;
  canManage(token: string): Promise<boolean>;
  canReadAudit(token: string): Promise<boolean>;
  canReadPrivate(token: string): Promise<boolean>;
  canManagePrivate(token: string): Promise<boolean>;
  list(
    token: string,
    query: {
      q?: string;
      status?: EngineerStatus;
      availabilityStatus?: AvailabilityStatus;
      limit: number;
      cursor?: { updatedAt: string; id: string };
    },
  ): Promise<{
    items: Engineer[];
    nextCursor: { updatedAt: string; id: string } | null;
  }>;
  findById(token: string, id: string): Promise<Engineer | null>;
  create(token: string, input: EngineerInput): Promise<Engineer>;
  update(
    token: string,
    id: string,
    rowVersion: number,
    input: EngineerInput,
  ): Promise<Engineer | null>;
  softDelete(
    token: string,
    id: string,
    rowVersion: number,
    reason: string,
    requestId: string,
  ): Promise<boolean>;
  listAudit(token: string, id: string): Promise<EngineerAuditEvent[]>;
  findPrivate(token: string, id: string): Promise<EngineerPrivateDetail | null>;
  savePrivate(
    token: string,
    id: string,
    rowVersion: number,
    input: EngineerPrivateInput,
    requestId: string,
  ): Promise<EngineerPrivateDetail | null>;
}

type Row = {
  id: string;
  management_no: string;
  family_name: string;
  given_name: string;
  display_name: string | null;
  status: EngineerStatus;
  availability_status: AvailabilityStatus;
  available_from: string | null;
  nearest_station: string | null;
  summary: string | null;
  updated_at: string;
  row_version: number;
};
type AuditRow = {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  action: string;
  request_id: string | null;
};
const select =
  'id,management_no,family_name,given_name,display_name,status,availability_status,available_from,nearest_station,summary,updated_at,row_version';

export class SupabaseEngineerRepository implements EngineerRepository {
  async canRead(token: string) {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'engineer.read' }),
    });
    return (await response.json()) === true;
  }
  async canManage(token: string) {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'engineer.manage' }),
    });
    return (await response.json()) === true;
  }
  async canReadAudit(token: string) {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'audit.read' }),
    });
    return (await response.json()) === true;
  }
  async canReadPrivate(token: string) {
    return this.hasPermission(token, 'engineer.private.read');
  }
  async canManagePrivate(token: string) {
    return this.hasPermission(token, 'engineer.private.manage');
  }
  private async hasPermission(token: string, requiredPermission: string) {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: requiredPermission }),
    });
    return (await response.json()) === true;
  }
  async list(
    token: string,
    query: {
      q?: string;
      status?: EngineerStatus;
      availabilityStatus?: AvailabilityStatus;
      limit: number;
      cursor?: { updatedAt: string; id: string };
    },
  ) {
    const params = new URLSearchParams({
      select,
      deleted_at: 'is.null',
      order: 'updated_at.desc,id.desc',
      limit: String(query.limit + 1),
    });
    const filters: string[] = [];
    if (query.status) params.set('status', `eq.${query.status}`);
    if (query.availabilityStatus)
      params.set('availability_status', `eq.${query.availabilityStatus}`);
    if (query.q) {
      const value = query.q.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
      filters.push(
        `or(management_no.ilike."*${value}*",name_normalized.ilike."*${value}*")`,
      );
    }
    if (query.cursor)
      filters.push(
        `or(updated_at.lt.${query.cursor.updatedAt},and(updated_at.eq.${query.cursor.updatedAt},id.lt.${query.cursor.id}))`,
      );
    if (filters.length) params.set('and', `(${filters.join(',')})`);
    const rows = (await (
      await this.request(token, `/engineers?${params.toString()}`)
    ).json()) as Row[];
    const visible = rows.slice(0, query.limit);
    const last = visible.at(-1);
    return {
      items: visible.map(map),
      nextCursor:
        rows.length > query.limit && last
          ? { updatedAt: last.updated_at, id: last.id }
          : null,
    };
  }
  async findById(token: string, id: string) {
    const params = new URLSearchParams({
      select,
      id: `eq.${id}`,
      deleted_at: 'is.null',
      limit: '1',
    });
    const row = (
      (await (
        await this.request(token, `/engineers?${params.toString()}`)
      ).json()) as Row[]
    )[0];
    return row ? map(row) : null;
  }
  async create(token: string, input: EngineerInput) {
    const tenantResponse = await this.request(token, '/rpc/current_tenant_id', {
      method: 'POST',
      body: '{}',
    });
    const tenantId = (await tenantResponse.json()) as string | null;
    if (!tenantId)
      throw new ApiError(403, 'forbidden', 'An active tenant is required');
    const response = await this.request(token, '/engineers', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify(toWriteRow(input, tenantId)),
    });
    return map(((await response.json()) as Row[])[0]!);
  }
  async update(
    token: string,
    id: string,
    rowVersion: number,
    input: EngineerInput,
  ) {
    const params = new URLSearchParams({
      id: `eq.${id}`,
      row_version: `eq.${rowVersion}`,
      deleted_at: 'is.null',
    });
    const response = await this.request(
      token,
      `/engineers?${params.toString()}`,
      {
        method: 'PATCH',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify(toWriteRow(input)),
      },
    );
    const row = ((await response.json()) as Row[])[0];
    return row ? map(row) : null;
  }
  async softDelete(
    token: string,
    id: string,
    rowVersion: number,
    reason: string,
    requestId: string,
  ) {
    const response = await this.request(token, '/rpc/soft_delete_engineer', {
      method: 'POST',
      body: JSON.stringify({
        p_engineer_id: id,
        p_row_version: rowVersion,
        p_delete_reason: reason,
        p_request_id: requestId,
      }),
    });
    return (await response.json()) === true;
  }
  async listAudit(token: string, id: string): Promise<EngineerAuditEvent[]> {
    const params = new URLSearchParams({
      select: 'id,occurred_at,actor_user_id,action,request_id',
      resource_type: 'eq.engineer',
      resource_id: `eq.${id}`,
      order: 'occurred_at.desc',
      limit: '50',
    });
    const response = await this.request(
      token,
      `/audit_event_summaries?${params.toString()}`,
    );
    return ((await response.json()) as AuditRow[]).map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at,
      actorUserId: row.actor_user_id,
      action: row.action,
      requestId: row.request_id,
    }));
  }
  async findPrivate(token: string, id: string) {
    const response = await this.request(
      token,
      '/rpc/get_engineer_private_detail',
      { method: 'POST', body: JSON.stringify({ p_engineer_id: id }) },
    );
    const row = (await response.json()) as PrivateRow | null;
    return row ? mapPrivate(row) : null;
  }
  async savePrivate(
    token: string,
    id: string,
    rowVersion: number,
    input: EngineerPrivateInput,
    requestId: string,
  ) {
    const response = await this.request(
      token,
      '/rpc/upsert_engineer_private_detail',
      {
        method: 'POST',
        body: JSON.stringify({
          p_engineer_id: id,
          p_row_version: rowVersion,
          p_detail: toPrivateRow(input),
          p_request_id: requestId,
        }),
      },
    );
    const row = (await response.json()) as PrivateRow | null;
    return row ? mapPrivate(row) : null;
  }
  private async request(token: string, path: string, init: RequestInit = {}) {
    const response = await fetch(
      `${requiredEnv('SUPABASE_URL')}/rest/v1${path}`,
      {
        ...init,
        headers: {
          apikey: requiredEnv('SUPABASE_ANON_KEY'),
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          ...init.headers,
        },
      },
    );
    if (!response.ok)
      throw new Error(`Supabase Data API failed with ${response.status}`);
    return response;
  }
}

type PrivateRow = {
  engineer_id: string;
  birth_date: string | null;
  gender: EngineerGender | null;
  personal_email: string | null;
  phone: string | null;
  postal_code: string | null;
  prefecture: string | null;
  city: string | null;
  address_line: string | null;
  emergency_contact: string | null;
  notes: string | null;
  updated_at: string;
  row_version: number;
};
function mapPrivate(r: PrivateRow): EngineerPrivateDetail {
  return {
    engineerId: r.engineer_id,
    birthDate: r.birth_date,
    gender: r.gender,
    personalEmail: r.personal_email,
    phone: r.phone,
    postalCode: r.postal_code,
    prefecture: r.prefecture,
    city: r.city,
    addressLine: r.address_line,
    emergencyContact: r.emergency_contact,
    notes: r.notes,
    updatedAt: r.updated_at,
    rowVersion: r.row_version,
  };
}
function toPrivateRow(i: EngineerPrivateInput) {
  return {
    birth_date: i.birthDate,
    gender: i.gender,
    personal_email: i.personalEmail,
    phone: i.phone,
    postal_code: i.postalCode,
    prefecture: i.prefecture,
    city: i.city,
    address_line: i.addressLine,
    emergency_contact: i.emergencyContact,
    notes: i.notes,
  };
}

function toWriteRow(input: EngineerInput, tenantId?: string) {
  const name = `${input.familyName} ${input.givenName}`;
  return {
    ...(tenantId ? { tenant_id: tenantId } : {}),
    management_no: input.managementNo,
    family_name: input.familyName,
    given_name: input.givenName,
    display_name: input.displayName,
    name_normalized: name.normalize('NFKC').toLowerCase(),
    status: input.status,
    availability_status: input.availabilityStatus,
    available_from: input.availableFrom,
    nearest_station: input.nearestStation,
    summary: input.summary,
  };
}

function map(row: Row): Engineer {
  return {
    id: row.id,
    managementNo: row.management_no,
    familyName: row.family_name,
    givenName: row.given_name,
    displayName: row.display_name,
    status: row.status,
    availabilityStatus: row.availability_status,
    availableFrom: row.available_from,
    nearestStation: row.nearest_station,
    summary: row.summary,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}
