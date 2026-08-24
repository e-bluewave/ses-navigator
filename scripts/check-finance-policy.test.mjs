import assert from 'node:assert/strict';
import test from 'node:test';

import { validateFinancePolicy } from './check-finance-policy.mjs';

const policy = {
  version: 1,
  scope: 'invoice-finance-business-rules',
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

test('accepts reviewed finance policy', () => {
  const result = validateFinancePolicy(policy);
  assert.equal(result.status, 'FINANCE_POLICY_PASSED');
  assert.deepEqual(result.failures, []);
});

test('rejects line-item rounding and wrong rounding method', () => {
  const result = validateFinancePolicy({
    ...policy,
    qualifiedInvoice: {
      ...policy.qualifiedInvoice,
      lineItemTaxRoundingAllowed: true,
    },
    consumptionTax: { ...policy.consumptionTax, roundingMethod: 'round' },
  });
  assert.ok(
    result.failures.includes('line-item tax rounding must be prohibited'),
  );
  assert.ok(result.failures.includes('tax rounding method must be floor'));
});

test('rejects unsafe withholding automation', () => {
  const result = validateFinancePolicy({
    ...policy,
    withholding: {
      ...policy.withholding,
      defaultApplicable: true,
      automaticIndustryNameOnlyDecisionAllowed: true,
    },
  });
  assert.ok(
    result.failures.includes('withholding default must be not applicable'),
  );
  assert.ok(
    result.failures.includes(
      'industry-name-only withholding decision must be prohibited',
    ),
  );
});

test('rejects direct overwrite and invoice number reuse', () => {
  const result = validateFinancePolicy({
    ...policy,
    invoiceCorrection: {
      ...policy.invoiceCorrection,
      confirmedInvoiceDirectOverwriteAllowed: true,
      issuedNumberReuseAllowed: true,
    },
  });
  assert.ok(
    result.failures.includes(
      'confirmed invoice direct overwrite must be prohibited',
    ),
  );
  assert.ok(
    result.failures.includes('issued invoice number reuse must be prohibited'),
  );
});

test('rejects hardcoded accounting mapping', () => {
  const result = validateFinancePolicy({
    ...policy,
    accountingMapping: {
      ...policy.accountingMapping,
      vendorSpecificCodesHardcoded: true,
      retroactiveChangeToConfirmedInvoicesAllowed: true,
    },
  });
  assert.ok(
    result.failures.includes(
      'vendor-specific accounting codes must not be hardcoded',
    ),
  );
  assert.ok(
    result.failures.includes(
      'accounting mapping must not retroactively change confirmed invoices',
    ),
  );
});
