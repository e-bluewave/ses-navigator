import { dataApiSchemaHeaders } from '../../shared/supabase-schema.js';
import { requiredEnv } from '../../plugins/authentication.js';
import { ApiError } from '../../shared/errors.js';

interface FetchRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

interface FetchResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

export interface Company {
  id: string;
  managementNo: string;
  legalName: string;
  displayName: string | null;
  corporateNumber: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  addressLine: string | null;
  websiteUrl: string | null;
  representativeName: string | null;
  status: string;
  updatedAt: string;
  rowVersion: number;
}

export interface CompanyListQuery {
  limit: number;
  cursor?: { updatedAt: string; id: string };
  query?: string;
  status?: string;
}

export interface CompanyInput {
  managementNo: string;
  legalName: string;
  displayName: string | null;
  corporateNumber: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  addressLine: string | null;
  websiteUrl: string | null;
  representativeName: string | null;
  status: string;
}

export interface CompanyAuditEvent {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  action: string;
  requestId: string | null;
}

export interface CompanyRepository {
  canRead(accessToken: string): Promise<boolean>;
  canManage(accessToken: string): Promise<boolean>;
  canReadAudit(accessToken: string): Promise<boolean>;
  list(
    accessToken: string,
    query: CompanyListQuery,
  ): Promise<{
    items: Company[];
    nextCursor: { updatedAt: string; id: string } | null;
  }>;
  findById(accessToken: string, id: string): Promise<Company | null>;
  create(accessToken: string, input: CompanyInput): Promise<Company>;
  update(
    accessToken: string,
    id: string,
    rowVersion: number,
    input: CompanyInput,
  ): Promise<Company | null>;
  softDelete(
    accessToken: string,
    id: string,
    rowVersion: number,
    reason: string,
    requestId: string,
  ): Promise<boolean>;
  listAudit(accessToken: string, id: string): Promise<CompanyAuditEvent[]>;
}

type CompanyRow = {
  id: string;
  management_no: string;
  legal_name: string;
  display_name: string | null;
  corporate_number: string | null;
  postal_code: string | null;
  prefecture: string | null;
  city: string | null;
  address_line: string | null;
  website_url: string | null;
  representative_name: string | null;
  status: string;
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
  'id,management_no,legal_name,display_name,corporate_number,postal_code,prefecture,city,address_line,website_url,representative_name,status,updated_at,row_version';

export class SupabaseCompanyRepository implements CompanyRepository {
  async canRead(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'company.read' }),
    });
    return (await response.json()) === true;
  }

  async canManage(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'company.manage' }),
    });
    return (await response.json()) === true;
  }

  async canReadAudit(token: string): Promise<boolean> {
    const response = await this.request(token, '/rpc/has_permission', {
      method: 'POST',
      body: JSON.stringify({ required_permission: 'audit.read' }),
    });
    return (await response.json()) === true;
  }

  async list(token: string, query: CompanyListQuery) {
    const params = new URLSearchParams({
      select,
      deleted_at: 'is.null',
      order: 'updated_at.desc,id.desc',
      limit: String(query.limit + 1),
    });
    const filters: string[] = [];
    if (query.query !== undefined) {
      const pattern = `"*${escapeFilterValue(query.query)}*"`;
      filters.push(
        `or(management_no.ilike.${pattern},legal_name.ilike.${pattern},display_name.ilike.${pattern})`,
      );
    }
    if (query.status !== undefined) params.set('status', `eq.${query.status}`);
    if (query.cursor !== undefined)
      filters.push(
        `or(updated_at.lt.${query.cursor.updatedAt},and(updated_at.eq.${query.cursor.updatedAt},id.lt.${query.cursor.id}))`,
      );
    if (filters.length > 0) params.set('and', `(${filters.join(',')})`);
    const response = await this.request(
      token,
      `/companies?${params.toString()}`,
    );
    const rows = (await response.json()) as CompanyRow[];
    const visible = rows.slice(0, query.limit);
    const last = visible.at(-1);
    return {
      items: visible.map(toCompany),
      nextCursor:
        rows.length > query.limit && last
          ? { updatedAt: last.updated_at, id: last.id }
          : null,
    };
  }

  async findById(token: string, id: string): Promise<Company | null> {
    const params = new URLSearchParams({
      select,
      id: `eq.${id}`,
      deleted_at: 'is.null',
      limit: '1',
    });
    const response = await this.request(
      token,
      `/companies?${params.toString()}`,
    );
    const rows = (await response.json()) as CompanyRow[];
    return rows[0] ? toCompany(rows[0]) : null;
  }

  async create(token: string, input: CompanyInput): Promise<Company> {
    const tenantResponse = await this.request(token, '/rpc/current_tenant_id', {
      method: 'POST',
      body: '{}',
    });
    const tenantId = (await tenantResponse.json()) as string | null;
    if (tenantId === null)
      throw new ApiError(403, 'forbidden', 'An active tenant is required');
    const response = await this.request(token, '/companies', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify(toCompanyWriteRow(input, tenantId)),
    });
    return toCompany(((await response.json()) as CompanyRow[])[0]!);
  }

  async update(
    token: string,
    id: string,
    rowVersion: number,
    input: CompanyInput,
  ): Promise<Company | null> {
    const params = new URLSearchParams({
      id: `eq.${id}`,
      row_version: `eq.${rowVersion}`,
      deleted_at: 'is.null',
    });
    const response = await this.request(
      token,
      `/companies?${params.toString()}`,
      {
        method: 'PATCH',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify(toCompanyWriteRow(input)),
      },
    );
    const rows = (await response.json()) as CompanyRow[];
    return rows[0] ? toCompany(rows[0]) : null;
  }

  async softDelete(
    token: string,
    id: string,
    rowVersion: number,
    reason: string,
    requestId: string,
  ) {
    const response = await this.request(token, '/rpc/soft_delete_company', {
      method: 'POST',
      body: JSON.stringify({
        p_company_id: id,
        p_row_version: rowVersion,
        p_delete_reason: reason,
        p_request_id: requestId,
      }),
    });
    return (await response.json()) === true;
  }

  async listAudit(token: string, id: string): Promise<CompanyAuditEvent[]> {
    const params = new URLSearchParams({
      select: 'id,occurred_at,actor_user_id,action,request_id',
      resource_type: 'eq.company',
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

  private async request(
    token: string,
    path: string,
    init: FetchRequestInit = {},
  ): Promise<FetchResponse> {
    const response = (await fetch(
      `${requiredEnv('SUPABASE_URL')}/rest/v1${path}`,
      {
        ...init,
        headers: {
          apikey: requiredEnv('SUPABASE_ANON_KEY'),
          authorization: `Bearer ${token}`,
          ...dataApiSchemaHeaders(path),
          'content-type': 'application/json',
          ...init.headers,
        },
      },
    )) as unknown as FetchResponse;
    if (!response.ok)
      throw new ApiError(
        502,
        'data_api_error',
        'The data service could not complete the request',
      );
    return response;
  }
}

function escapeFilterValue(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('*', '\\*');
}

function toCompanyWriteRow(input: CompanyInput, tenantId?: string) {
  return {
    ...(tenantId ? { tenant_id: tenantId } : {}),
    management_no: input.managementNo,
    legal_name: input.legalName,
    legal_name_normalized: input.legalName.normalize('NFKC').toLowerCase(),
    display_name: input.displayName,
    corporate_number: input.corporateNumber,
    postal_code: input.postalCode,
    prefecture: input.prefecture,
    city: input.city,
    address_line: input.addressLine,
    website_url: input.websiteUrl,
    representative_name: input.representativeName,
    status: input.status,
  };
}

function toCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    managementNo: row.management_no,
    legalName: row.legal_name,
    displayName: row.display_name,
    corporateNumber: row.corporate_number,
    postalCode: row.postal_code,
    prefecture: row.prefecture,
    city: row.city,
    addressLine: row.address_line,
    websiteUrl: row.website_url,
    representativeName: row.representative_name,
    status: row.status,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}
