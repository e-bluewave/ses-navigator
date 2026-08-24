import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const REQUIRED_CATEGORIES = new Set([
  'audit-events',
  'transaction-emails',
  'general-business-emails',
  'ai-input-output',
  'personal-data-default',
  'engineer-resumes',
  'contracts',
  'invoices',
]);

export function validateRetentionPolicy(policy) {
  const failures = [];
  const review = policy?.review ?? {};
  const globalRules = policy?.globalRules ?? {};
  const categories = Array.isArray(policy?.categories) ? policy.categories : [];
  const exceptions = policy?.exceptions ?? {};

  if (policy?.version !== 1) failures.push('policy version must be 1');
  if (policy?.scope !== 'data-retention-and-disposal') {
    failures.push('scope must be data-retention-and-disposal');
  }
  if (policy?.jurisdiction !== 'JP') failures.push('jurisdiction must be JP');

  if (review.annualReviewRequired !== true) {
    failures.push('annual retention review is required');
  }
  if (review.legalChangeReviewRequired !== true) {
    failures.push('legal change review is required');
  }
  if (review.businessOwnerRequired !== true) {
    failures.push('business owner is required');
  }
  if (review.privacyOwnerRequired !== true) {
    failures.push('privacy owner is required');
  }

  if (globalRules.legalHoldOverridesDeletion !== true) {
    failures.push('legal hold must override deletion');
  }
  if (globalRules.deleteOrAnonymizeWhenPurposeEnds !== true) {
    failures.push('purpose-ended personal data must be deleted or anonymized');
  }
  if (globalRules.backupExpiryMustNotReintroduceDeletedData !== true) {
    failures.push('backup restore must not reintroduce expired data');
  }
  if (globalRules.retentionMetadataRequired !== true) {
    failures.push('retention metadata is required');
  }
  if (globalRules.deletionEvidenceRequired !== true) {
    failures.push('deletion evidence is required');
  }
  if (globalRules.productionIdentifiersInRepositoryAllowed !== false) {
    failures.push('Production identifiers must not be stored in repository');
  }
  if (globalRules.personalDataInRepositoryAllowed !== false) {
    failures.push('personal data must not be stored in repository');
  }

  const byId = new Map(categories.map((category) => [category?.id, category]));
  for (const id of REQUIRED_CATEGORIES) {
    if (!byId.has(id))
      failures.push(`required retention category missing: ${id}`);
  }

  const expected = {
    'audit-events': ['retentionDays', 1095],
    'transaction-emails': ['retentionYears', 7],
    'general-business-emails': ['retentionDays', 1095],
    'ai-input-output': ['retentionDays', 365],
    'personal-data-default': ['maximumDaysAfterPurposeEnds', 90],
    'engineer-resumes': ['retentionDaysAfterRelationshipEnds', 365],
    contracts: ['retentionYears', 10],
    invoices: ['retentionYears', 7],
  };

  for (const [id, [field, value]] of Object.entries(expected)) {
    if (byId.get(id)?.[field] !== value) {
      failures.push(`${id} approved retention value must not drift`);
    }
  }

  for (const category of categories) {
    if (
      typeof category?.trigger !== 'string' ||
      category.trigger.length === 0
    ) {
      failures.push(
        `retention trigger is required: ${category?.id ?? 'unknown'}`,
      );
    }
    if (
      typeof category?.disposition !== 'string' ||
      category.disposition.length === 0
    ) {
      failures.push(`disposition is required: ${category?.id ?? 'unknown'}`);
    }
    if (typeof category?.basis !== 'string' || category.basis.length === 0) {
      failures.push(
        `retention basis is required: ${category?.id ?? 'unknown'}`,
      );
    }
  }

  if (exceptions.approvalRequired !== true) {
    failures.push('retention exceptions require approval');
  }
  if (exceptions.reasonRequired !== true) {
    failures.push('retention exceptions require a reason');
  }
  if (exceptions.expiryRequired !== true) {
    failures.push('retention exceptions require an expiry');
  }
  if (exceptions.legalHoldOwnerRequired !== true) {
    failures.push('legal hold owner is required');
  }

  return {
    status:
      failures.length === 0
        ? 'RETENTION_POLICY_PASSED'
        : 'RETENTION_POLICY_FAILED',
    failures,
  };
}

export async function runRetentionPolicyCheck({
  policyPath = 'ops/retention-policy.json',
  log = console.log,
} = {}) {
  const policyText = await readFile(policyPath, 'utf8');
  const result = validateRetentionPolicy(JSON.parse(policyText));
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(
      `Retention policy check failed (${result.failures.length})`,
    );
  }
  return result;
}

if (isMainModule(import.meta.url)) {
  runRetentionPolicyCheck().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Retention policy check failed',
    );
    process.exitCode = 1;
  });
}
