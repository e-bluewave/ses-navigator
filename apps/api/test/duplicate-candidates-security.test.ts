import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../../../supabase/migrations/164_duplicate_candidate_review_rpc.sql',
  import.meta.url,
);

describe('Duplicate candidate review database boundary', () => {
  it('lists only current-tenant candidates whose paired records are readable', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    expect(sql).toContain('tenant uuid := app.current_tenant_id()');
    expect(sql).toContain('candidate.tenant_id = tenant');
    expect(sql).toContain(
      "app.can_access_company(candidate.source_company_id, 'company.read', 'view')",
    );
    expect(sql).toContain(
      "app.can_access_company(candidate.candidate_company_id, 'company.read', 'view')",
    );
    expect(sql).toContain(
      "app.can_access_engineer(candidate.engineer_id_a, 'engineer.read', 'view')",
    );
    expect(sql).toContain(
      "app.can_access_engineer(candidate.engineer_id_b, 'engineer.read', 'view')",
    );
    expect(sql).toContain(
      "app.can_access_project(candidate.source_project_id, 'project.read', 'view')",
    );
    expect(sql).toContain(
      "app.can_access_project(candidate.candidate_project_id, 'project.read', 'view')",
    );
  });

  it('requires manage access to both records and never performs an entity merge', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    expect(sql).toContain(
      "app.can_access_company(candidate.source_company_id, 'company.manage', 'edit')",
    );
    expect(sql).toContain(
      "app.can_access_engineer(candidate.engineer_id_a, 'engineer.manage', 'edit')",
    );
    expect(sql).toContain(
      "app.can_access_project(candidate.source_project_id, 'project.manage', 'edit')",
    );
    expect(sql).toContain('for update;');
    expect(sql).not.toContain('insert into app.engineer_merge_jobs');
    expect(sql).not.toContain('insert into app.project_merge_jobs');
    expect(sql).not.toContain('delete from app.companies');
    expect(sql).not.toContain('delete from app.engineers');
    expect(sql).not.toContain('delete from app.projects');
  });

  it('normalizes schema-specific hold states and records reviewer metadata and audit', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    expect(sql).toContain("when 'hold' then 'needs_review'");
    expect(sql).toContain("when 'hold' then 'dismissed'");
    expect(sql).toContain("when 'hold' then 'ignored'");
    expect(sql).toContain('decided_by = actor');
    expect(sql).toContain('reviewed_by = actor');
    expect(sql).toContain("'duplicate_candidate.reviewed'");
  });

  it('exposes only the two explicit authenticated RPC boundaries', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    expect(sql).toContain(
      'revoke all on function public.list_duplicate_candidates(',
    );
    expect(sql).toContain(
      'revoke all on function public.review_duplicate_candidate(',
    );
    expect(sql).toContain('to authenticated;');
  });
});
