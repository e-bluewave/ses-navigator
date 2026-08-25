import { readFile } from 'node:fs/promises';

import { isMainModule } from './cli-entry.mjs';

const requiredFields = [
  'evidenceId',
  'environment',
  'completedAt',
  'qualifiedInvoiceValidated',
  'registrationNumberExternalized',
  'taxRatesTenAndEightValidated',
  'defaultTaxRateTenValidated',
  'taxRoundingOncePerInvoicePerRateValidated',
  'lineItemTaxRoundingNotUsed',
  'floorRoundingValidated',
  'withholdingDefaultNotApplicableValidated',
  'withholdingOverrideValidated',
  'industryNameOnlyInferenceNotUsed',
  'businessReviewCompleted',
  'confirmedInvoiceOverwriteBlocked',
  'revisionHistoryValidated',
  'originalInvoiceLinkValidated',
  'reasonActorTimestampValidated',
  'issuedNumberReuseBlocked',
  'configurableAccountingMappingValidated',
  'vendorSpecificCodesNotHardcoded',
  'confirmedInvoiceMappingNotRetroactivelyChanged',
  'stagingBusinessValidationCompleted',
  'productionIdentifiersRecorded',
  'personalDataRecorded',
  'secretOrPersonalDataExposed',
  'secretFreeEvidence',
];

const allowedFields = new Set([
  ...requiredFields,
  'followUpRequired',
  'followUpReferencePresent',
  'notes',
]);
const allowedEnvironments = new Set(['Staging', 'Disposable']);
const sensitivePatterns = [
  /postgres(?:ql)?:\/\//iu,
  /https?:\/\/[a-z0-9-]+\.supabase\.co/iu,
  /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/u,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
];

export function validateFinanceEvidence(document, policy) {
  const findings = [];

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return failed('evidence-object-required');
  }
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return failed('finance-policy-object-required');
  }

  for (const key of Object.keys(document)) {
    if (!allowedFields.has(key)) findings.push(`unknown-field:${key}`);
  }
  for (const field of requiredFields) {
    if (!(field in document) || isBlank(document[field])) {
      findings.push(`required-field-missing:${field}`);
    }
  }

  if (!allowedEnvironments.has(document.environment)) {
    findings.push('environment-must-be-staging-or-disposable');
  }

  for (const field of [
    'qualifiedInvoiceValidated',
    'registrationNumberExternalized',
    'taxRatesTenAndEightValidated',
    'defaultTaxRateTenValidated',
    'taxRoundingOncePerInvoicePerRateValidated',
    'lineItemTaxRoundingNotUsed',
    'floorRoundingValidated',
    'withholdingDefaultNotApplicableValidated',
    'withholdingOverrideValidated',
    'industryNameOnlyInferenceNotUsed',
    'businessReviewCompleted',
    'confirmedInvoiceOverwriteBlocked',
    'revisionHistoryValidated',
    'originalInvoiceLinkValidated',
    'reasonActorTimestampValidated',
    'issuedNumberReuseBlocked',
    'configurableAccountingMappingValidated',
    'vendorSpecificCodesNotHardcoded',
    'confirmedInvoiceMappingNotRetroactivelyChanged',
    'stagingBusinessValidationCompleted',
    'secretFreeEvidence',
  ]) {
    if (document[field] !== true) findings.push(`${field}-must-be-true`);
  }

  for (const field of [
    'productionIdentifiersRecorded',
    'personalDataRecorded',
    'secretOrPersonalDataExposed',
  ]) {
    if (document[field] !== false) findings.push(`${field}-must-be-false`);
  }

  if (policy.qualifiedInvoice?.supported !== true) {
    findings.push('policy-qualified-invoice-support-required');
  }
  if (policy.qualifiedInvoice?.registrationNumberStoredInRepository !== false) {
    findings.push('policy-registration-number-must-not-be-stored-in-repository');
  }
  if (policy.qualifiedInvoice?.taxRoundingFrequency !== 'once-per-invoice-per-tax-rate') {
    findings.push('policy-tax-rounding-frequency-invalid');
  }
  if (policy.qualifiedInvoice?.lineItemTaxRoundingAllowed !== false) {
    findings.push('policy-line-item-tax-rounding-must-be-forbidden');
  }

  const supportedRates = policy.consumptionTax?.supportedRatesPercent;
  if (!Array.isArray(supportedRates) || !supportedRates.includes(10) || !supportedRates.includes(8)) {
    findings.push('policy-tax-rates-10-and-8-required');
  }
  if (policy.consumptionTax?.defaultRatePercent !== 10) {
    findings.push('policy-default-tax-rate-must-be-10');
  }
  if (policy.consumptionTax?.roundingMethod !== 'floor') {
    findings.push('policy-rounding-method-must-be-floor');
  }
  if (policy.consumptionTax?.roundingUnit !== 'invoice-tax-rate-total') {
    findings.push('policy-rounding-unit-invalid');
  }

  if (policy.withholding?.defaultApplicable !== false) {
    findings.push('policy-withholding-default-must-be-false');
  }
  if (policy.withholding?.counterpartyOrInvoiceOverrideRequired !== true) {
    findings.push('policy-withholding-override-required');
  }
  if (policy.withholding?.automaticIndustryNameOnlyDecisionAllowed !== false) {
    findings.push('policy-industry-name-only-inference-must-be-forbidden');
  }
  if (policy.withholding?.businessReviewRequired !== true) {
    findings.push('policy-withholding-business-review-required');
  }

  if (policy.invoiceCorrection?.confirmedInvoiceDirectOverwriteAllowed !== false) {
    findings.push('policy-confirmed-invoice-overwrite-must-be-forbidden');
  }
  if (policy.invoiceCorrection?.revisionHistoryRequired !== true) {
    findings.push('policy-revision-history-required');
  }
  if (policy.invoiceCorrection?.originalInvoiceLinkRequired !== true) {
    findings.push('policy-original-invoice-link-required');
  }
  if (policy.invoiceCorrection?.reasonActorTimestampRequired !== true) {
    findings.push('policy-reason-actor-timestamp-required');
  }
  if (policy.invoiceCorrection?.issuedNumberReuseAllowed !== false) {
    findings.push('policy-issued-number-reuse-must-be-forbidden');
  }

  if (policy.accountingMapping?.vendorSpecificCodesHardcoded !== false) {
    findings.push('policy-vendor-specific-codes-must-not-be-hardcoded');
  }
  if (policy.accountingMapping?.configurableMappingRequired !== true) {
    findings.push('policy-configurable-accounting-mapping-required');
  }
  if (policy.accountingMapping?.retroactiveChangeToConfirmedInvoicesAllowed !== false) {
    findings.push('policy-confirmed-invoice-mapping-retroactive-change-must-be-forbidden');
  }
  if (policy.production?.businessReviewRequired !== true) {
    findings.push('policy-production-business-review-required');
  }
  if (policy.production?.stagingValidationRequired !== true) {
    findings.push('policy-staging-validation-required');
  }

  if (
    typeof document.completedAt === 'string' &&
    Number.isNaN(Date.parse(document.completedAt))
  ) {
    findings.push('invalid-timestamp:completedAt');
  }

  if (
    document.followUpRequired === true &&
    document.followUpReferencePresent !== true
  ) {
    findings.push('follow-up-reference-required');
  }

  for (const [field, value] of Object.entries(document)) {
    if (typeof value !== 'string') continue;
    for (const pattern of sensitivePatterns) {
      if (pattern.test(value)) {
        findings.push(`sensitive-finance-value:${field}`);
        break;
      }
    }
  }

  return {
    status:
      findings.length === 0
        ? 'FINANCE_EVIDENCE_PASSED'
        : 'FINANCE_EVIDENCE_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export async function runFinanceEvidenceCheck({
  evidencePath,
  policyPath = 'ops/finance-policy.json',
  log = console.log,
} = {}) {
  if (!evidencePath) throw new Error('Finance evidence path is required');
  const [document, policy] = await Promise.all([
    readJson(evidencePath),
    readJson(policyPath),
  ]);
  const result = validateFinanceEvidence(document, policy);
  log(JSON.stringify(result, null, 2));
  if (!result.complete) {
    throw new Error(`Finance evidence check failed (${result.findings.length})`);
  }
  return result;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function isBlank(value) {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && value.trim() === '';
}

function failed(rule) {
  return {
    status: 'FINANCE_EVIDENCE_FAILED',
    complete: false,
    findings: [rule],
  };
}

if (isMainModule(import.meta.url)) {
  runFinanceEvidenceCheck({ evidencePath: process.argv[2] }).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Finance evidence check failed');
    process.exitCode = 1;
  });
}
