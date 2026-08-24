import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const REQUIRED_FIELDS = [
  'secretId',
  'provider',
  'purpose',
  'environment',
  'storage',
  'owner',
  'components',
  'issuedAt',
  'updatedAt',
  'status',
  'nextReviewAt',
  'revocationCondition',
];

const ALLOWED_ENVIRONMENTS = new Set([
  'Local',
  'CI',
  'Staging',
  'Production',
]);
const ALLOWED_STATUSES = new Set(['active', 'rotating', 'revoked']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const SECRET_VALUE_PATTERNS = [
  {
    rule: 'supabase-secret-value',
    pattern: /\bsb_secret_[A-Za-z0-9_-]+\b/u,
  },
  {
    rule: 'jwt-like-value',
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
  },
  {
    rule: 'openai-key-like-value',
    pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/u,
  },
];

export function validateSecretInventory(document) {
  const findings = [];
  const rows = Array.isArray(document?.secrets) ? document.secrets : null;

  if (!rows) {
    return {
      status: 'SECRET_INVENTORY_FAILED',
      rowCount: 0,
      findings: [
        { row: null, field: 'secrets', rule: 'secrets-array-required' },
      ],
    };
  }

  if (rows.length === 0) {
    findings.push({ row: null, field: 'secrets', rule: 'inventory-empty' });
  }

  const ids = new Set();

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      findings.push({ row: rowNumber, field: null, rule: 'row-object-required' });
      return;
    }

    const keys = Object.keys(row);
    for (const key of keys) {
      if (!REQUIRED_FIELDS.includes(key)) {
        findings.push({ row: rowNumber, field: key, rule: 'unknown-field' });
      }
    }

    for (const field of REQUIRED_FIELDS) {
      if (!(field in row) || isBlank(row[field])) {
        findings.push({ row: rowNumber, field, rule: 'required-field-missing' });
      }
    }

    if (typeof row.secretId === 'string' && row.secretId.trim()) {
      if (ids.has(row.secretId)) {
        findings.push({
          row: rowNumber,
          field: 'secretId',
          rule: 'duplicate-secret-id',
        });
      }
      ids.add(row.secretId);
    }

    if (
      typeof row.environment === 'string' &&
      !ALLOWED_ENVIRONMENTS.has(row.environment)
    ) {
      findings.push({
        row: rowNumber,
        field: 'environment',
        rule: 'invalid-environment',
      });
    }

    if (typeof row.status === 'string' && !ALLOWED_STATUSES.has(row.status)) {
      findings.push({ row: rowNumber, field: 'status', rule: 'invalid-status' });
    }

    for (const field of ['issuedAt', 'updatedAt', 'nextReviewAt']) {
      if (typeof row[field] === 'string' && !DATE_RE.test(row[field])) {
        findings.push({ row: rowNumber, field, rule: 'invalid-date-format' });
      }
    }

    if (
      typeof row.storage === 'string' &&
      /^https?:\/\//iu.test(row.storage.trim())
    ) {
      findings.push({
        row: rowNumber,
        field: 'storage',
        rule: 'direct-url-not-allowed',
      });
    }

    if (!Array.isArray(row.components) || row.components.length === 0) {
      findings.push({
        row: rowNumber,
        field: 'components',
        rule: 'components-array-required',
      });
    }

    scanForSecretLikeValues(row, rowNumber, findings);
  });

  return {
    status:
      findings.length === 0
        ? 'SECRET_INVENTORY_PASSED'
        : 'SECRET_INVENTORY_FAILED',
    rowCount: rows.length,
    findings,
  };
}

export async function runSecretInventoryCheck({
  path,
  log = console.log,
} = {}) {
  if (!path) throw new Error('Secret inventory path is required');
  const source = await readFile(path, 'utf8');
  const document = JSON.parse(source);
  const result = validateSecretInventory(document);
  log(JSON.stringify(result, null, 2));
  if (result.findings.length > 0) {
    throw new Error(
      `Secret inventory check failed (${result.findings.length})`,
    );
  }
  return result;
}

function scanForSecretLikeValues(row, rowNumber, findings) {
  for (const [field, value] of Object.entries(row)) {
    for (const scalar of flattenScalars(value)) {
      if (typeof scalar !== 'string') continue;
      for (const { rule, pattern } of SECRET_VALUE_PATTERNS) {
        if (pattern.test(scalar)) {
          findings.push({ row: rowNumber, field, rule });
        }
      }
    }
  }
}

function flattenScalars(value) {
  if (Array.isArray(value)) return value.flatMap(flattenScalars);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(flattenScalars);
  }
  return [value];
}

function isBlank(value) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  );
}

if (isMainModule(import.meta.url)) {
  const path = process.argv[2];
  runSecretInventoryCheck({ path }).catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Secret inventory check failed',
    );
    process.exitCode = 1;
  });
}
