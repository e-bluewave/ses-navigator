import { describe, expect, it } from 'vitest';
import { dataApiSchemaHeaders } from './supabase-schema.js';

describe('dataApiSchemaHeaders', () => {
  it('routes relation requests to the app schema', () => {
    expect(dataApiSchemaHeaders('/projects?select=id')).toEqual({
      'accept-profile': 'app',
      'content-profile': 'app',
    });
  });

  it('routes RPC requests to the public schema', () => {
    expect(dataApiSchemaHeaders('/rpc/has_permission')).toEqual({
      'accept-profile': 'public',
      'content-profile': 'public',
    });
  });

  it('does not classify similarly named relations as RPCs', () => {
    expect(dataApiSchemaHeaders('/rpc_audit_events')).toEqual({
      'accept-profile': 'app',
      'content-profile': 'app',
    });
  });
});
