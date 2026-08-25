import assert from 'node:assert/strict';
import test from 'node:test';

import { validateFinanceEvidence } from './check-finance-evidence.mjs';

const policy = {
  qualifiedInvoice: {
    supported: true,
    registrationNumberStoredInRepository: false,
    taxRoundingFrequency: 'once-per-invoice-per-tax-rate',
    lineItemTaxRoundingAllowed: false,
  },
  consumptionTax: {
    supportedRatesPercent: [10, 8],
    defaultRatePercent: 10,
    roundingMethod: 'floor',
    roundingUnit: 'invoice-tax-rate-total',
  },
  withholding: {
    defaultApplicable: false,
    counterpartyOrInvoiceOverrideRequired: true,
    automaticIndustryNameOnlyDecisionAllowed: false,
    businessReviewRequired: true,
  },
  invoiceCorrection: {
    confirmedInvoiceDirectOverwriteAllowed: false,
    revisionHistoryRequired: true,
    originalInvoiceLinkRequired: true,
    reasonActorTimestampRequired: true,
    issuedNumberReuseAllowed: false,
  },
  accountingMapping: {
    vendorSpecificCodesHardcoded: false,
    configurableMappingRequired: true,
    retroactiveChangeToConfirmedInvoicesAllowed: false,
  },
  production: {
    businessReviewRequired: true,
    stagingValidationRequired: true,
  },
};

function validEvidence() {
  return {
    evidenceId: 'BA016-FINANCE-20260825-01',
    environment: 'Staging',
    completedAt: '2026-08-25T17:00:00+09:00',
    qualifiedInvoiceValidated: true,
    registrationNumberExternalized: true,
    taxRatesTenAndEightValidated: true,
    defaultTaxRateTenValidated: true,
    taxRoundingOncePerInvoicePerRateValidated: true,
    lineItemTaxRoundingNotUsed: true,
    floorRoundingValidated: true,
    withholdingDefaultNotApplicableValidated: true,
    withholdingOverrideValidated: true,
    industryNameOnlyInferenceNotUsed: true,
    businessReviewCompleted: true,
    confirmedInvoiceOverwriteBlocked: true,
    revisionHistoryValidated: true,
    originalInvoiceLinkValidated: true,
    reasonActorTimestampValidated: true,
    issuedNumberReuseBlocked: true,
    configurableAccountingMappingValidated: true,
    vendorSpecificCodesNotHardcoded: true,
    confirmedInvoiceMappingNotRetroactivelyChanged: true,
    stagingBusinessValidationCompleted: true,
    productionIdentifiersRecorded: false,
    personalDataRecorded: false,
    secretOrPersonalDataExposed: false,
    secretFreeEvidence: true,
    followUpRequired: false,
    notes: 'Secret-free finance business validation evidence.',
  };
}

test('accepts complete BA-016 finance evidence', () => {
  const result = validateFinanceEvidence(validEvidence(), policy);
  assert.equal(result.status, 'FINANCE_EVIDENCE_PASSED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
});

test('requires tax and withholding validations', () => {
  const evidence = validEvidence();
  evidence.taxRatesTenAndEightValidated = false;
  evidence.taxRoundingOncePerInvoicePerRateValidated = false;
  evidence.withholdingOverrideValidated = false;
  const result = validateFinanceEvidence(evidence, policy);
  assert.ok(
    result.findings.includes('taxRatesTenAndEightValidated-must-be-true'),
  );
  assert.ok(
    result.findings.includes(
      'taxRoundingOncePerInvoicePerRateValidated-must-be-true',
    ),
  );
  assert.ok(
    result.findings.includes('withholdingOverrideValidated-must-be-true'),
  );
});

test('requires immutable confirmed invoice history behavior', () => {
  const evidence = validEvidence();
  evidence.confirmedInvoiceOverwriteBlocked = false;
  evidence.revisionHistoryValidated = false;
  evidence.originalInvoiceLinkValidated = false;
  evidence.issuedNumberReuseBlocked = false;
  const result = validateFinanceEvidence(evidence, policy);
  assert.ok(
    result.findings.includes('confirmedInvoiceOverwriteBlocked-must-be-true'),
  );
  assert.ok(result.findings.includes('revisionHistoryValidated-must-be-true'));
  assert.ok(
    result.findings.includes('originalInvoiceLinkValidated-must-be-true'),
  );
  assert.ok(result.findings.includes('issuedNumberReuseBlocked-must-be-true'));
});

test('rejects incompatible finance policy changes', () => {
  const invalidPolicy = structuredClone(policy);
  invalidPolicy.qualifiedInvoice.lineItemTaxRoundingAllowed = true;
  invalidPolicy.consumptionTax.roundingMethod = 'round';
  invalidPolicy.withholding.automaticIndustryNameOnlyDecisionAllowed = true;
  invalidPolicy.invoiceCorrection.confirmedInvoiceDirectOverwriteAllowed = true;
  invalidPolicy.accountingMapping.vendorSpecificCodesHardcoded = true;
  const result = validateFinanceEvidence(validEvidence(), invalidPolicy);
  assert.ok(
    result.findings.includes('policy-line-item-tax-rounding-must-be-forbidden'),
  );
  assert.ok(result.findings.includes('policy-rounding-method-must-be-floor'));
  assert.ok(
    result.findings.includes(
      'policy-industry-name-only-inference-must-be-forbidden',
    ),
  );
  assert.ok(
    result.findings.includes(
      'policy-confirmed-invoice-overwrite-must-be-forbidden',
    ),
  );
  assert.ok(
    result.findings.includes(
      'policy-vendor-specific-codes-must-not-be-hardcoded',
    ),
  );
});

test('requires follow-up reference when follow-up is required', () => {
  const evidence = validEvidence();
  evidence.followUpRequired = true;
  evidence.followUpReferencePresent = false;
  const result = validateFinanceEvidence(evidence, policy);
  assert.ok(result.findings.includes('follow-up-reference-required'));
});

test('rejects invalid timestamp, unknown field, and sensitive value', () => {
  const evidence = validEvidence();
  evidence.completedAt = 'invalid';
  evidence.notes = 'postgresql://example.invalid';
  evidence.registrationNumber = 'must-not-be-recorded';
  const result = validateFinanceEvidence(evidence, policy);
  assert.ok(result.findings.includes('invalid-timestamp:completedAt'));
  assert.ok(result.findings.includes('sensitive-finance-value:notes'));
  assert.ok(result.findings.includes('unknown-field:registrationNumber'));
});
