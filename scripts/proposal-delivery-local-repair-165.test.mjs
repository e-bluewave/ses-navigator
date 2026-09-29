import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildProposalDeliveryMigration165RepairSql } from './proposal-delivery-local-repair-165.mjs';

test('builds a narrow repair from the corrected Migration 165 source', async () => {
  const migrationSql = await readFile(
    new URL('../supabase/migrations/165_proposal_message_delivery_rpc.sql', import.meta.url),
    'utf8',
  );

  const repairSql = buildProposalDeliveryMigration165RepairSql(migrationSql);

  assert.equal(
    (repairSql.match(/create or replace function public\.prepare_proposal_message_delivery\(/gu) ?? [])
      .length,
    1,
  );
  assert.equal(
    (repairSql.match(/create or replace function public\.prepare_proposal_message_retry\(/gu) ?? [])
      .length,
    1,
  );
  assert.equal((repairSql.match(/extensions\.digest\(/gu) ?? []).length, 2);
  assert.equal(repairSql.includes('public.digest('), false);
  assert.equal(repairSql.includes('alter table app.outbound_messages'), false);
  assert.equal(repairSql.includes('create index'), false);
  assert.equal(repairSql.includes('grant execute'), false);
});

test('refuses to build a repair while Migration 165 still uses public.digest', () => {
  assert.throws(
    () =>
      buildProposalDeliveryMigration165RepairSql(
        `create or replace function public.prepare_proposal_message_delivery()
returns void language sql as $$ select public.digest('x'::bytea, 'sha256') $$;
create or replace function public.prepare_proposal_message_retry()
returns void language sql as $$ select public.digest('x'::bytea, 'sha256') $$;`,
      ),
    /still contains public\.digest/u,
  );
});
