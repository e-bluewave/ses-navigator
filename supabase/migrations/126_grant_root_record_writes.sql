-- SES Navigator
-- Migration: 126_grant_root_record_writes
-- Purpose: Enable reviewed root-record create/update APIs while retaining RLS authorization.

begin;

grant insert, update on table
  app.projects,
  app.companies,
  app.company_contacts,
  app.engineers
to authenticated;

commit;
