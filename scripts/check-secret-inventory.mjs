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

const ALLOWED_ENVIRONMENTS = new Set();
ALLOWED_ENVIRONMENTS.add('Local');
ALLOWED_ENVIRONMENTS.add('CI');
ALLOWED_ENVIRONMENTS.add('Staging');
ALLOWED_ENVIRONMENTS.add('Production');

const ALLOWED_STATUSES = new Set();
ALLOWED_STATUSES.add('active');
ALLOWED_STATUSES.add('rotating');
ALLOWED_STATUSES.add('revoked');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const SUPABASE_SECRET_RE = /\bsb_secret_[A-Za-z0-9_-]+\b/u;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u;
const OPENAI_KEY_RE = /\bsk-[A-Za-z0-9_-]{16,}\b/u;

const SECRET_VALUE_PATTERNS = [
  ['supabase-secret-value', SUPABASE_SECRET_RE],
  ['jwt-like-value', JWT_RE],
  ['openai-key-like-value', OPENAI_KEY_RE],
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
    addFinding(findings, null, 'secrets', 'inventory-empty');
  }

  const ids = new Set();

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      addFinding(findings, rowNumber, null, 'row-object-required');
      return;
    }

    for (const key of Object.keys(row)) {
      if (!REQUIRED_FIELDS.includes(key)) {
        addFinding(findings, rowNumber, key, 'unknown-field');
      }
    }

    for (const field of REQUIRED_FIELDS) {
      if (!(field in row) || isBlank(row[field])) {
        addFinding(findings, rowNumber, field, 'required-field-missing');
      }
    }

    if (typeof row.secretId === 'string' && row.secretId.trim()) {
      if (ids.has(row.secretId)) {
        addFinding(findings, rowNumber, 'secretId', 'duplicate-secret-id');
      }
      ids.add(row.secretId);
    }

    if (
      typeof row.environment === 'string' &&
      !ALLOWED_ENVIRONMENTS.has(row.environment)
    ) {
      addFinding(findings, rowNumber, 'environment', 'invalid-environment');
    }

    if (typeof row.status === 'string' && !ALLOWED_STATUSES.has(row.status)) {
      addFinding(findings, rowNumber, 'status', 'invalid-status');
    }

    for (const field of ['issuedAt', 'updatedAt', 'nextReviewAt']) {
      if (typeof row[field] === 'string' && !DATE_RE.test(row[field])) {
        addFinding(findings, rowNumber, field, 'invalid-date-format');
      }
    }

    if (
      typeof row.storage === 'string' &&
      /^https?:\/\//iu.test(row.storage.trim())
    ) {
      addFinding(findings, rowNumber, 'storage', 'direct-url-not-allowed');
    }

    if (!Array.isArray(row.components) || row.components.length === 0) {
      addFinding(findings, rowNumber, 'components', 'components-array-required');
    }

    scanForSecretLikeValues(row, rowNumber, findings);
  });

  let status = 'SECRET_INVENTORY_PASSED';
  if (findings.length > 0) {
    status = 'SECRET_INVENTORY_FAILED';
  }

  return {
    status,
    rowCount: rows.length,
    findings,
  };
}

export async function runSecretInventoryCheck(options = {}) {
  const { path, log = console.log } = options;
  if (!path) throw new Error('Secret inventory path is required');

  const source = await readFile(path, 'utf8');
  const document = JSON.parse(source);
  const result = validateSecretInventory(document);
  log(JSON.stringify(result, null, 2));

  if (result.findings.length > 0) {
    const count = result.findings.length;
    throw new Error(`Secret inventory check failed (${count})`);
  }

  return result;
}

function addFinding(findings, row, field, rule) {
  findings.push({ row, field, rule });
}

function scanForSecretLikeValues(row, rowNumber, findings) {
  for (const [field, value] of Object.entries(row)) {
    for (const scalar of flattenScalars(value)) {
      if (typeof scalar !== 'string') continue;

      for (const [rule, pattern] of SECRET_VALUE_PATTERNS) {
        if (pattern.test(scalar)) {
          addFinding(findings, rowNumber, field, rule);
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
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  return value.trim() === '';
}

if (isMainModule(import.meta.url)) {
  const path = process.argv[2];
  runSecretInventoryCheck({ path }).catch((error) => {
    const message =
      error instanceof Error ? error.message : 'Secret inventory check failed';
    console.error(message);
    process.exitCode = 1;
  });
}
