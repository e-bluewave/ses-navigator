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
export type EngineerAffiliationType =
  'employee' | 'freelance' | 'partner_employee' | 'subcontractor' | 'other';
export interface EngineerAffiliation {
  id: string;
  engineerId: string;
  companyId: string;
  affiliationType: EngineerAffiliationType;
  contractType: string | null;
  startDate: string;
  endDate: string | null;
  isPrimary: boolean;
  notes: string | null;
  updatedAt: string;
  rowVersion: number;
}
export type EngineerAffiliationInput = Omit<
  EngineerAffiliation,
  'id' | 'engineerId' | 'updatedAt' | 'rowVersion'
>;
export type RemotePreference = 'onsite' | 'hybrid' | 'remote' | 'flexible';
export interface EngineerPreference {
  id: string;
  engineerId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  desiredRateMin: number | null;
  desiredRateMax: number | null;
  currencyCode: string;
  remotePreference: RemotePreference;
  weeklyDaysMin: number | null;
  weeklyDaysMax: number | null;
  overtimeLimitHours: number | null;
  availableFrom: string | null;
  notes: string | null;
  locations: string[];
  contractTypes: string[];
  updatedAt: string;
  rowVersion: number;
}
export type EngineerPreferenceInput = Omit<
  EngineerPreference,
  'id' | 'engineerId' | 'updatedAt' | 'rowVersion'
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
  listAffiliations(
    token: string,
    engineerId: string,
  ): Promise<EngineerAffiliation[]>;
  saveAffiliation(
    token: string,
    engineerId: string,
    affiliationId: string | null,
    rowVersion: number,
    input: EngineerAffiliationInput,
    requestId: string,
  ): Promise<EngineerAffiliation | null>;
  listPreferences(
    token: string,
    engineerId: string,
  ): Promise<EngineerPreference[]>;
  savePreference(
    token: string,
    engineerId: string,
    preferenceId: string | null,
    rowVersion: number,
    input: EngineerPreferenceInput,
    requestId: string,
  ): Promise<EngineerPreference | null>;
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
  async listAffiliations(token: string, engineerId: string) {
    const params = new URLSearchParams({
      select:
        'id,engineer_id,company_id,affiliation_type,contract_type,start_date,end_date,is_primary,notes,updated_at,row_version',
      engineer_id: `eq.${engineerId}`,
      order: 'start_date.desc,id.desc',
    });
    return (
      (await (
        await this.request(token, `/engineer_affiliations?${params.toString()}`)
      ).json()) as AffiliationRow[]
    ).map(mapAffiliation);
  }
  async saveAffiliation(
    token: string,
    engineerId: string,
    affiliationId: string | null,
    rowVersion: number,
    input: EngineerAffiliationInput,
    requestId: string,
  ) {
    const response = await this.request(
      token,
      '/rpc/save_engineer_affiliation',
      {
        method: 'POST',
        body: JSON.stringify({
          p_engineer_id: engineerId,
          p_affiliation_id: affiliationId,
          p_row_version: rowVersion,
          p_affiliation: {
            company_id: input.companyId,
            affiliation_type: input.affiliationType,
            contract_type: input.contractType,
            start_date: input.startDate,
            end_date: input.endDate,
            is_primary: input.isPrimary,
            notes: input.notes,
          },
          p_request_id: requestId,
        }),
      },
    );
    const row = (await response.json()) as AffiliationRow | null;
    return row ? mapAffiliation(row) : null;
  }
  async listPreferences(token: string, engineerId: string) {
    const params = new URLSearchParams({
      select:
        'id,engineer_id,effective_from,effective_to,desired_rate_min,desired_rate_max,currency_code,remote_preference,weekly_days_min,weekly_days_max,overtime_limit_hours,available_from,notes,updated_at,row_version',
      engineer_id: `eq.${engineerId}`,
      order: 'effective_from.desc,id.desc',
    });
    const rows = (await (
      await this.request(token, `/engineer_preferences?${params.toString()}`)
    ).json()) as PreferenceRow[];
    const locations = (await (
      await this.request(
        token,
        `/engineer_preferred_locations?select=prefecture,city,station_name&engineer_id=eq.${engineerId}&order=priority.asc`,
      )
    ).json()) as {
      prefecture: string | null;
      city: string | null;
      station_name: string | null;
    }[];
    const contracts = (await (
      await this.request(
        token,
        `/engineer_preferred_contract_types?select=contract_type&engineer_id=eq.${engineerId}&order=priority.asc`,
      )
    ).json()) as { contract_type: string }[];
    return rows.map((row) =>
      mapPreference(
        row,
        locations.map((x) =>
          [x.prefecture, x.city, x.station_name].filter(Boolean).join(' '),
        ),
        contracts.map((x) => x.contract_type),
      ),
    );
  }
  async savePreference(
    token: string,
    engineerId: string,
    preferenceId: string | null,
    rowVersion: number,
    input: EngineerPreferenceInput,
    requestId: string,
  ) {
    const response = await this.request(
      token,
      '/rpc/save_engineer_preference',
      {
        method: 'POST',
        body: JSON.stringify({
          p_engineer_id: engineerId,
          p_preference_id: preferenceId,
          p_row_version: rowVersion,
          p_preference: {
            effective_from: input.effectiveFrom,
            effective_to: input.effectiveTo,
            desired_rate_min: input.desiredRateMin,
            desired_rate_max: input.desiredRateMax,
            currency_code: input.currencyCode,
            remote_preference: input.remotePreference,
            weekly_days_min: input.weeklyDaysMin,
            weekly_days_max: input.weeklyDaysMax,
            overtime_limit_hours: input.overtimeLimitHours,
            available_from: input.availableFrom,
            notes: input.notes,
          },
          p_locations: input.locations.map((prefecture) => ({ prefecture })),
          p_contract_types: input.contractTypes,
          p_request_id: requestId,
        }),
      },
    );
    const row = (await response.json()) as PreferenceRow | null;
    return row
      ? mapPreference(row, input.locations, input.contractTypes)
      : null;
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
type AffiliationRow = {
  id: string;
  engineer_id: string;
  company_id: string;
  affiliation_type: EngineerAffiliationType;
  contract_type: string | null;
  start_date: string;
  end_date: string | null;
  is_primary: boolean;
  notes: string | null;
  updated_at: string;
  row_version: number;
};
const mapAffiliation = (row: AffiliationRow): EngineerAffiliation => ({
  id: row.id,
  engineerId: row.engineer_id,
  companyId: row.company_id,
  affiliationType: row.affiliation_type,
  contractType: row.contract_type,
  startDate: row.start_date,
  endDate: row.end_date,
  isPrimary: row.is_primary,
  notes: row.notes,
  updatedAt: row.updated_at,
  rowVersion: row.row_version,
});
type PreferenceRow = {
  id: string;
  engineer_id: string;
  effective_from: string;
  effective_to: string | null;
  desired_rate_min: number | null;
  desired_rate_max: number | null;
  currency_code: string;
  remote_preference: RemotePreference;
  weekly_days_min: number | null;
  weekly_days_max: number | null;
  overtime_limit_hours: number | null;
  available_from: string | null;
  notes: string | null;
  updated_at: string;
  row_version: number;
};
const mapPreference = (
  r: PreferenceRow,
  locations: string[],
  contractTypes: string[],
): EngineerPreference => ({
  id: r.id,
  engineerId: r.engineer_id,
  effectiveFrom: r.effective_from,
  effectiveTo: r.effective_to,
  desiredRateMin: r.desired_rate_min,
  desiredRateMax: r.desired_rate_max,
  currencyCode: r.currency_code,
  remotePreference: r.remote_preference,
  weeklyDaysMin: r.weekly_days_min,
  weeklyDaysMax: r.weekly_days_max,
  overtimeLimitHours: r.overtime_limit_hours,
  availableFrom: r.available_from,
  notes: r.notes,
  locations,
  contractTypes,
  updatedAt: r.updated_at,
  rowVersion: r.row_version,
});

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
