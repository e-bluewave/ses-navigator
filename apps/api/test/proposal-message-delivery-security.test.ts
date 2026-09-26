import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../../../supabase/migrations/165_proposal_message_delivery_rpc.sql',
  import.meta.url,
);

describe('Proposal message delivery database boundary', () => {
  it('requires both proposal and message send permissions in the current tenant', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    expect(sql).toContain('tenant uuid := app.current_tenant_id()');
    expect(sql).toContain("not app.has_permission('message.send')");
    expect(sql).toContain("not app.has_permission('proposal.send')");
    expect(sql).toContain(
      "app.can_access_proposal(p.id, 'proposal.send', 'edit')",
    );
    expect(sql).toContain(
      "app.can_access_outbound_message(m.id, 'message.send', 'edit')",
    );
  });

  it('locks approved messages before moving them to queued state', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    expect(sql).toContain("and m.status = 'approved'");
    expect(sql).toContain('for update;');
    expect(sql).toContain("set status = 'queued'");
    expect(sql).toContain('approved_version_id is not null');
    expect(sql).toContain("status in ('approved','queued','sent','failed')");
  });

  it('retries only failed recipients and preserves append-only attempt numbers', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    expect(sql).toContain("and r.delivery_status = 'failed'");
    expect(sql).toContain('select max(existing.attempt_no)');
    expect(sql).toContain(') + 1,');
    expect(sql).not.toContain(
      "where r.delivery_status in ('failed','bounced')",
    );
    expect(sql).not.toContain('delete from app.message_delivery_attempts');
  });

  it('keeps delivery result recording service-role-only and hides provider payloads from reads', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    expect(sql).toContain("if auth.role() is distinct from 'service_role'");
    expect(sql).toContain(
      'revoke all on function public.record_proposal_message_delivery_result(',
    );
    expect(sql).toContain(
      'grant execute on function public.record_proposal_message_delivery_result(',
    );
    expect(sql).toContain('to service_role;');

    const safeRead = sql.slice(
      sql.indexOf(
        'create or replace function private.proposal_message_delivery_json',
      ),
      sql.indexOf(
        'create or replace function public.prepare_proposal_message_delivery',
      ),
    );
    expect(safeRead).not.toContain('response_payload');
  });

  it('keeps direct delivery table writes out of the authenticated API surface', async () => {
    const grants = await readFile(
      new URL(
        '../../../supabase/migrations/113_data_api_grants.sql',
        import.meta.url,
      ),
      'utf8',
    );

    const outboundReadGrant = grants.slice(
      grants.indexOf(
        '-- Proposal, approval, outbound-message, and interview reads.',
      ),
      grants.indexOf('-- Files are readable through RLS;'),
    );
    expect(outboundReadGrant).toContain('grant select on table');
    expect(outboundReadGrant).toContain('app.message_delivery_attempts,');
    expect(outboundReadGrant).toContain('to authenticated;');
    expect(grants).not.toContain(
      'grant select, insert, update on table app.message_delivery_attempts',
    );
  });
});
