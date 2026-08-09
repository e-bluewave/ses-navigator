import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

export type ContactStatus = 'active' | 'inactive' | 'left_company' | 'unknown';

export interface CompanyContact {
  id: string;
  companyId: string;
  managementNo: string;
  familyName: string;
  givenName: string | null;
  departmentName: string | null;
  positionTitle: string | null;
  email: string | null;
  phone: string | null;
  mobilePhone: string | null;
  isPrimary: boolean;
  status: ContactStatus;
  updatedAt: string;
  rowVersion: number;
}
export interface ContactInput {
  companyId: string;
  managementNo: string;
  familyName: string;
  givenName: string | null;
  departmentName: string | null;
  positionTitle: string | null;
  email: string | null;
  phone: string | null;
  mobilePhone: string | null;
  isPrimary: boolean;
  status: ContactStatus;
}

export interface ContactRepository {
  canRead(token: string): Promise<boolean>;
  canManage(token: string): Promise<boolean>;
  list(
    token: string,
    query: {
      companyId?: string;
      q?: string;
      status?: ContactStatus;
      limit: number;
      cursor?: { updatedAt: string; id: string };
    },
  ): Promise<{
    items: CompanyContact[];
    nextCursor: { updatedAt: string; id: string } | null;
  }>;
  findById(token: string, id: string): Promise<CompanyContact | null>;
  create(token: string, input: ContactInput): Promise<CompanyContact>;
  update(
    token: string,
    id: string,
    rowVersion: number,
    input: ContactInput,
  ): Promise<CompanyContact | null>;
}

type Row = {
  id: string;
  company_id: string;
  management_no: string;
  family_name: string;
  given_name: string | null;
  department_name: string | null;
  position_title: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  is_primary: boolean;
  contact_status: ContactStatus;
  updated_at: string;
  row_version: number;
};
const select =
  'id,company_id,management_no,family_name,given_name,department_name,position_title,email,phone,mobile_phone,is_primary,contact_status,updated_at,row_version';

export class SupabaseContactRepository implements ContactRepository {
  async canRead(token: string) {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'company.read' }),
    });
    return (await response.json()) === true;
  }
  async canManage(token: string) {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'company.manage' }),
    });
    return (await response.json()) === true;
  }
  async list(
    token: string,
    query: {
      companyId?: string;
      q?: string;
      status?: ContactStatus;
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
    if (query.companyId) params.set('company_id', `eq.${query.companyId}`);
    if (query.status) params.set('contact_status', `eq.${query.status}`);
    if (query.q) {
      const value = query.q.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
      filters.push(
        `or(management_no.ilike."*${value}*",full_name_normalized.ilike."*${value}*",email.ilike."*${value}*")`,
      );
    }
    if (query.cursor)
      filters.push(
        `or(updated_at.lt.${query.cursor.updatedAt},and(updated_at.eq.${query.cursor.updatedAt},id.lt.${query.cursor.id}))`,
      );
    if (filters.length) params.set('and', `(${filters.join(',')})`);
    const response = await this.request(
      token,
      `/company_contacts?${params.toString()}`,
    );
    const rows = (await response.json()) as Row[];
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
    const response = await this.request(
      token,
      `/company_contacts?${params.toString()}`,
    );
    const row = ((await response.json()) as Row[])[0];
    return row ? map(row) : null;
  }
  async create(token: string, input: ContactInput) {
    const tenantResponse = await this.request(token, '/rpc/current_tenant_id', {
      method: 'POST',
      body: '{}',
    });
    const tenantId = (await tenantResponse.json()) as string | null;
    if (!tenantId)
      throw new ApiError(403, 'forbidden', 'An active tenant is required');
    const response = await this.request(token, '/company_contacts', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify(writeRow(input, tenantId)),
    });
    return map(((await response.json()) as Row[])[0]!);
  }
  async update(
    token: string,
    id: string,
    rowVersion: number,
    input: ContactInput,
  ) {
    const params = new URLSearchParams({
      id: `eq.${id}`,
      row_version: `eq.${rowVersion}`,
      deleted_at: 'is.null',
    });
    const response = await this.request(
      token,
      `/company_contacts?${params.toString()}`,
      {
        method: 'PATCH',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify(writeRow(input)),
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
function writeRow(input: ContactInput, tenantId?: string) {
  const fullName = `${input.familyName} ${input.givenName ?? ''}`
    .trim()
    .normalize('NFKC')
    .toLowerCase();
  const digits = (value: string | null) => value?.replace(/\D/g, '') || null;
  return {
    ...(tenantId ? { tenant_id: tenantId } : {}),
    company_id: input.companyId,
    management_no: input.managementNo,
    family_name: input.familyName,
    given_name: input.givenName,
    full_name_normalized: fullName,
    department_name: input.departmentName,
    position_title: input.positionTitle,
    email: input.email,
    email_normalized: input.email?.normalize('NFKC').toLowerCase() ?? null,
    phone: input.phone,
    phone_normalized: digits(input.phone),
    mobile_phone: input.mobilePhone,
    mobile_phone_normalized: digits(input.mobilePhone),
    is_primary: input.isPrimary,
    contact_status: input.status,
  };
}

function map(row: Row): CompanyContact {
  return {
    id: row.id,
    companyId: row.company_id,
    managementNo: row.management_no,
    familyName: row.family_name,
    givenName: row.given_name,
    departmentName: row.department_name,
    positionTitle: row.position_title,
    email: row.email,
    phone: row.phone,
    mobilePhone: row.mobile_phone,
    isPrimary: row.is_primary,
    status: row.contact_status,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}
