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

export interface EngineerRepository {
  canRead(token: string): Promise<boolean>;
  canManage(token: string): Promise<boolean>;
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
