import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRestoredTombstoneSql,
  compareApplicationTableSets,
  parseBackupTombstones,
  parseExpectedApplicationTables,
  parseRestoredApplicationTables,
  parseRestoredTombstoneCounts,
  summarizeTombstoneParity,
} from './restore-db-semantic-parity.mjs';

test('parses exact app/audit table identities from schema dump', () => {
  const schema = `
CREATE TABLE app.projects (id uuid);
CREATE TABLE "audit"."events" (id uuid);
CREATE TABLE IF NOT EXISTS "app"."odd""name" (id uuid);
CREATE TABLE public.ignored (id uuid);
`;
  const identities = parseExpectedApplicationTables(schema);
  assert.equal(identities.length, 3);
  assert.ok(identities.includes('app\u0000projects'));
  assert.ok(identities.includes('audit\u0000events'));
  assert.ok(identities.includes('app\u0000odd"name'));
});

test('parses restored table JSON and compares exact sets', () => {
  const restored = parseRestoredApplicationTables(
    JSON.stringify([
      ['app', 'projects'],
      ['audit', 'events'],
    ]),
  );
  assert.deepEqual(restored, ['app\u0000projects', 'audit\u0000events'].sort());

  const same = compareApplicationTableSets(restored, [...restored]);
  assert.equal(same.complete, true);
  assert.equal(same.missingTableCount, 0);
  assert.equal(same.extraTableCount, 0);

  const mismatch = compareApplicationTableSets(restored, ['app\u0000projects']);
  assert.equal(mismatch.complete, false);
  assert.equal(mismatch.missingTableCount, 1);
});

test('extracts deleted_at tombstones from pg_dump COPY blocks', () => {
  const data = String.raw`COPY app.projects (id, deleted_at, name) FROM stdin;
1	\N	one
2	2026-09-01 00:00:00+00	two
\.
COPY "audit"."events" (id, "deleted_at") FROM stdin;
3	2026-09-02 00:00:00+00
4	\N
\.
COPY app.no_tombstone (id, name) FROM stdin;
5	five
\.
`;
  const expectations = parseBackupTombstones(data);
  assert.deepEqual(
    expectations.map(({ tableIdentity, expectedCount }) => ({
      tableIdentity,
      expectedCount,
    })),
    [
      { tableIdentity: 'app\u0000projects', expectedCount: 1 },
      { tableIdentity: 'audit\u0000events', expectedCount: 1 },
    ].sort((a, b) => a.tableIdentity.localeCompare(b.tableIdentity)),
  );
});

test('builds quoted tombstone SQL without exposing values', () => {
  const sql = buildRestoredTombstoneSql([
    { tableIdentity: 'app\u0000odd"name', expectedCount: 2 },
  ]);
  assert.match(sql, /"app"\."odd""name"/u);
  assert.match(sql, /"deleted_at" IS NOT NULL/u);
});

test('parses restored tombstone counts and summarizes parity', () => {
  const expectations = [
    { tableIdentity: 'app\u0000projects', expectedCount: 2 },
    { tableIdentity: 'audit\u0000events', expectedCount: 0 },
  ];
  const comparisons = parseRestoredTombstoneCounts('[2,0]', expectations);
  const summary = summarizeTombstoneParity(comparisons);
  assert.equal(summary.complete, true);
  assert.equal(summary.tombstoneTableCount, 2);
  assert.equal(summary.expectedTombstoneCount, 2);
  assert.equal(summary.restoredTombstoneCount, 2);
  assert.equal(summary.tombstoneMismatchCount, 0);
});

test('fails tombstone parity when any restored count differs', () => {
  const expectations = [
    { tableIdentity: 'app\u0000projects', expectedCount: 2 },
  ];
  const comparisons = parseRestoredTombstoneCounts('[1]', expectations);
  const summary = summarizeTombstoneParity(comparisons);
  assert.equal(summary.complete, false);
  assert.equal(summary.tombstoneMismatchCount, 1);
});
