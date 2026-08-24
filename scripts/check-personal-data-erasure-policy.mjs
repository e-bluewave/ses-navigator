import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const REQUIRED_MODES = new Set(['hard-delete', 'irreversible-anonymization']);
const PROHIBITED = new Set(['masking-only', 'pseudonymization-only', 'soft-delete-only']);

export function validatePersonalDataErasurePolicy(policy) {
  const failures = [];
  const anonymization = policy?.anonymization ?? {};
  const legalHold = policy?.legalHold ?? {};
  const tenant = policy?.tenantTermination ?? {};
  const execution = policy?.execution ?? {};
  const governance = policy?.governance ?? {};

  if (policy?.version !== 1) failures.push('policy version must be 1');
  if (policy?.scope !== 'personal-data-erasure-and-anonymization') {
    failures.push('scope must be personal-data-erasure-and-anonymization');
  }
  if (policy?.jurisdiction !== 'JP') failures.push('jurisdiction must be JP');
  if (policy?.retentionPolicyTrackedBy !== 'BA-010') failures.push('retention must be tracked by BA-010');
  if (policy?.purposeEndedDeletionDeadlineDays !== 90) failures.push('purpose-ended deletion deadline must remain 90 days');

  const modes = new Set(policy?.allowedDispositionModes ?? []);
  for (const mode of REQUIRED_MODES) if (!modes.has(mode)) failures.push(`required disposition mode missing: ${mode}`);
  const prohibited = new Set(policy?.prohibitedAsDeletionSubstitutes ?? []);
  for (const mode of PROHIBITED) if (!prohibited.has(mode)) failures.push(`prohibited deletion substitute missing: ${mode}`);

  if (anonymization.mustBeIrreversible !== true) failures.push('anonymization must be irreversible');
  if (anonymization.reidentificationKeyAllowed !== false) failures.push('re-identification key must be prohibited');
  if (anonymization.directIdentifiersRemoved !== true) failures.push('direct identifiers must be removed');
  if (anonymization.linkableIdentifiersRemovedOrGeneralized !== true) failures.push('linkable identifiers must be removed or generalized');
  if (anonymization.verificationRequired !== true) failures.push('anonymization verification is required');

  if (legalHold.overridesDeletion !== true) failures.push('legal hold must override deletion');
  if (legalHold.ownerRequired !== true || legalHold.reasonRequired !== true) failures.push('legal hold owner and reason are required');
  if (legalHold.startedAtRequired !== true || legalHold.reviewAtRequired !== true) failures.push('legal hold timestamps and review are required');
  if (legalHold.indefiniteHoldWithoutReviewAllowed !== false) failures.push('indefinite legal hold without review must be prohibited');
  if (legalHold.holdDataAccessRestricted !== true) failures.push('legal hold data access must be restricted');

  for (const [field, message] of [
    ['accessRevocationRequired', 'tenant access revocation is required'],
    ['newWritesBlockedRequired', 'tenant new writes must be blocked'],
    ['inventoryRequired', 'tenant data inventory is required'],
    ['retentionClassificationRequired', 'tenant retention classification is required'],
    ['purgeOrAnonymizeNonHeldDataWithinPurposeDeadline', 'tenant non-held data must be purged within purpose deadline'],
    ['storageObjectsIncluded', 'tenant Storage objects must be included'],
    ['integrationCredentialsRevoked', 'tenant integration credentials must be revoked'],
    ['webhooksAndTokensRevoked', 'tenant webhooks and tokens must be revoked'],
  ]) {
    if (tenant[field] !== true) failures.push(message);
  }

  for (const [field, message] of [
    ['deletionRequestIdRequired', 'deletion request id is required'],
    ['dryRunInventoryRequired', 'deletion dry-run inventory is required'],
    ['databaseDeletionRequired', 'database deletion is required'],
    ['storageDeletionRequired', 'Storage deletion is required'],
    ['searchOrDerivedDataDeletionRequired', 'derived-data deletion is required'],
    ['backupTombstoneLedgerRequired', 'backup tombstone ledger is required'],
    ['restoreReapplyDeletionRequired', 'restore must reapply deletion ledger'],
    ['deletionEvidenceRequired', 'deletion evidence is required'],
    ['evidenceMustExcludePersonalData', 'deletion evidence must exclude personal data'],
  ]) {
    if (execution[field] !== true) failures.push(message);
  }

  if (governance.privacyOwnerRequired !== true) failures.push('privacy owner is required');
  if (governance.technicalOwnerRequired !== true) failures.push('technical owner is required');
  if (governance.annualReviewRequired !== true) failures.push('annual review is required');
  if (governance.legalChangeReviewRequired !== true) failures.push('legal change review is required');
  if (governance.productionIdentifiersInRepositoryAllowed !== false) failures.push('Production identifiers must not be stored in repository');
  if (governance.personalDataInRepositoryAllowed !== false) failures.push('personal data must not be stored in repository');

  return {
    status: failures.length === 0 ? 'PERSONAL_DATA_ERASURE_POLICY_PASSED' : 'PERSONAL_DATA_ERASURE_POLICY_FAILED',
    failures,
  };
}

export async function runPersonalDataErasurePolicyCheck({ policyPath = 'ops/personal-data-erasure-policy.json', log = console.log } = {}) {
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  const result = validatePersonalDataErasurePolicy(policy);
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) throw new Error(`Personal data erasure policy check failed (${result.failures.length})`);
  return result;
}

if (isMainModule(import.meta.url)) {
  runPersonalDataErasurePolicyCheck().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Personal data erasure policy check failed');
    process.exitCode = 1;
  });
}
