import { requiredEnv } from '../../plugins/authentication.js';

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

export interface EngineerRepository {
  canRead(token: string): Promise<boolean>;
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
