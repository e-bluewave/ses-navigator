-- SES Navigator
-- Migration: 002_schemas
-- Purpose: Create application-owned PostgreSQL schemas.

begin;

create schema if not exists app;
create schema if not exists master;
create schema if not exists private;
create schema if not exists audit;
create schema if not exists integration;
create schema if not exists reporting;

comment on schema app is
  'Primary transactional tables and application-facing database objects.';

comment on schema master is
  'Reference data, controlled vocabularies, and normalization dictionaries.';

comment on schema private is
  'Sensitive data and internal-only database objects not intended for direct client access.';

comment on schema audit is
  'Immutable or append-oriented audit records and change histories.';

comment on schema integration is
  'External-system ingestion, synchronization, and source-tracking objects.';

comment on schema reporting is
  'Read-oriented views and derived objects used for reporting and analytics.';

-- Schema creation does not grant client access. Explicit grants are added in
-- later migrations after roles, helper functions, and RLS policies exist.

commit;
