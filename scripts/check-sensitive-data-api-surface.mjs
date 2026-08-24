import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isMainModule } from './cli-entry.mjs';

export const closedSensitiveRelations = [
  'app.ai_execution_inputs',
  'app.ai_execution_outputs',
  'app.engineer_resume_versions',
  'app.project_extraction_results',
  'app.project_source_versions',
  'app.resume_extraction_results',
  'app.webhook_deliveries',
  'app.webhook_subscriptions',
];

export const limitedSensitiveRelations = {
  'app.ai_executions': 'public.ai_execution_summaries',
  'app.contracts': 'public.contract_summaries',
  'app.engineer_private_details': 'public.engineer_private_summaries',
  'app.expense_records': 'public.finance_expense_summaries',
  'app.invoices': 'public.finance_invoice_summaries',
  'app.project_sources': 'public.project_source_summaries',
  'audit.audit_logs': 'public.audit_event_summaries',
};

export function validateSensitiveDataApiSurface(files) {
  const fullSelect = new Map();
  const source = files.map((file) => file.source).join('\n');

  for (const file of files) applyFullSelectSql(fullSelect, file.source);

  const failures = [];
  const clientRoles = ['anon', 'authenticated'];

  for (const relation of closedSensitiveRelations) {
    for (const role of clientRoles) {
      if (hasFullSelect(fullSelect, role, relation)) {
        failures.push(`${role} must not have full SELECT on ${relation}`);
      }
    }
  }

  for (const [relation, view] of Object.entries(limitedSensitiveRelations)) {
    for (const role of clientRoles) {
      if (hasFullSelect(fullSelect, role, relation)) {
        failures.push(`${role} must not have full SELECT on ${relation}`);
      }
    }
    if (!definesReviewedView(source, view)) {
      failures.push(`reviewed limited view is missing: ${view}`);
    }
  }

  for (const view of Object.values(limitedSensitiveRelations)) {
    if (!grantsViewToAuthenticated(source, view)) {
      failures.push(`authenticated SELECT grant is missing for ${view}`);
    }
  }

  return {
    status:
      failures.length === 0
        ? 'SENSITIVE_DATA_API_SURFACE_PASSED'
        : 'SENSITIVE_DATA_API_SURFACE_FAILED',
    closedSensitiveRelations,
    limitedSensitiveRelations,
    failures,
  };
}

export async function runSensitiveDataApiSurfaceCheck({
  migrationsPath = 'supabase/migrations',
  log = console.log,
} = {}) {
  const names = (await readdir(migrationsPath))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const files = await Promise.all(
    names.map(async (name) => ({
      name,
      source: await readFile(join(migrationsPath, name), 'utf8'),
    })),
  );
  const result = validateSensitiveDataApiSurface(files);
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(
      `Sensitive Data API surface guard failed (${result.failures.length})`,
    );
  }
  return result;
}

function applyFullSelectSql(state, source) {
  const pattern =
    /\b(grant|revoke)\s+select\s+on\s+table\s+([^;]*?)\s+(to|from)\s+([^;]+);/giu;
  for (const match of source.matchAll(pattern)) {
    const operation = match[1].toLowerCase();
    const relations = match[2]
      .split(',')
      .map(normalizeIdentifier)
      .filter(Boolean);
    const roles = match[4]
      .split(',')
      .map(normalizeIdentifier)
      .filter((role) => ['anon', 'authenticated'].includes(role));

    for (const role of roles) {
      for (const relation of relations) {
        state.set(`${role}:${relation}`, operation === 'grant');
      }
    }
  }
}

function hasFullSelect(state, role, relation) {
  return state.get(`${role}:${relation}`) === true;
}

function definesReviewedView(source, view) {
  const escaped = escapeRegExp(view);
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+view\\s+${escaped}\\b[\\s\\S]*?security_barrier\\s*=\\s*true[\\s\\S]*?security_invoker\\s*=\\s*true`,
    'iu',
  );
  return pattern.test(source);
}

function grantsViewToAuthenticated(source, view) {
  const escaped = escapeRegExp(view);
  const direct = new RegExp(
    `grant\\s+select\\s+on(?:\\s+table)?\\s+${escaped}\\s+to\\s+authenticated\\s*;`,
    'iu',
  );
  if (direct.test(source)) return true;

  const grouped =
    /grant\s+select\s+on(?:\s+table)?\s+([\s\S]*?)\s+to\s+authenticated\s*;/giu;
  for (const match of source.matchAll(grouped)) {
    const relations = match[1]
      .split(',')
      .map(normalizeIdentifier)
      .filter(Boolean);
    if (relations.includes(view)) return true;
  }
  return false;
}

function normalizeIdentifier(value) {
  return value
    .replace(/--[^\n]*/gu, '')
    .replace(/\s+/gu, '')
    .replace(/^only/iu, '')
    .replaceAll('"', '')
    .toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

if (isMainModule(import.meta.url)) {
  runSensitiveDataApiSurfaceCheck().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Sensitive Data API surface check failed',
    );
    process.exitCode = 1;
  });
}
