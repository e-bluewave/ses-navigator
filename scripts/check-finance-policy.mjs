import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

export function validateFinancePolicy(policy) {
  const failures = [];
  const invoice = policy?.qualifiedInvoice ?? {};
  const tax = policy?.consumptionTax ?? {};
  const withholding = policy?.withholding ?? {};
  const correction = policy?.invoiceCorrection ?? {};
  const mapping = policy?.accountingMapping ?? {};
  const production = policy?.production ?? {};

  if (policy?.version !== 1) failures.push('policy version must be 1');
  if (policy?.scope !== 'invoice-finance-business-rules') {
    failures.push('scope must be invoice-finance-business-rules');
  }

  if (invoice.supported !== true) failures.push('qualified invoice support is required');
  if (invoice.registrationNumberStoredInRepository !== false) {
    failures.push('qualified invoice registration number must not be stored in repository');
  }
  if (invoice.taxRoundingFrequency !== 'once-per-invoice-per-tax-rate') {
    failures.push('tax rounding must occur once per invoice per tax rate');
  }
  if (invoice.lineItemTaxRoundingAllowed !== false) {
    failures.push('line-item tax rounding must be prohibited');
  }

  if (!Array.isArray(tax.supportedRatesPercent) || !tax.supportedRatesPercent.includes(10)) {
    failures.push('10 percent tax rate support is required');
  }
  if (!Array.isArray(tax.supportedRatesPercent) || !tax.supportedRatesPercent.includes(8)) {
    failures.push('8 percent tax rate support is required');
  }
  if (tax.defaultRatePercent !== 10) failures.push('default tax rate must be 10 percent');
  if (tax.roundingMethod !== 'floor') failures.push('tax rounding method must be floor');
  if (tax.roundingUnit !== 'invoice-tax-rate-total') {
    failures.push('tax rounding unit must be invoice-tax-rate-total');
  }

  if (withholding.defaultApplicable !== false) {
    failures.push('withholding default must be not applicable');
  }
  if (withholding.counterpartyOrInvoiceOverrideRequired !== true) {
    failures.push('withholding override must be supported per counterparty or invoice');
  }
  if (withholding.automaticIndustryNameOnlyDecisionAllowed !== false) {
    failures.push('industry-name-only withholding decision must be prohibited');
  }
  if (withholding.businessReviewRequired !== true) {
    failures.push('withholding business review is required');
  }

  if (correction.confirmedInvoiceDirectOverwriteAllowed !== false) {
    failures.push('confirmed invoice direct overwrite must be prohibited');
  }
  for (const [key, message] of [
    ['revisionHistoryRequired', 'invoice revision history is required'],
    ['originalInvoiceLinkRequired', 'original invoice link is required'],
    ['reasonActorTimestampRequired', 'correction reason actor timestamp is required'],
  ]) {
    if (correction[key] !== true) failures.push(message);
  }
  if (correction.issuedNumberReuseAllowed !== false) {
    failures.push('issued invoice number reuse must be prohibited');
  }

  if (mapping.vendorSpecificCodesHardcoded !== false) {
    failures.push('vendor-specific accounting codes must not be hardcoded');
  }
  if (mapping.configurableMappingRequired !== true) {
    failures.push('configurable accounting mapping is required');
  }
  if (mapping.retroactiveChangeToConfirmedInvoicesAllowed !== false) {
    failures.push('accounting mapping must not retroactively change confirmed invoices');
  }

  if (production.businessReviewRequired !== true) failures.push('Production business review is required');
  if (production.stagingValidationRequired !== true) failures.push('Staging validation is required');

  return {
    status: failures.length === 0 ? 'FINANCE_POLICY_PASSED' : 'FINANCE_POLICY_FAILED',
    failures,
  };
}

export async function runFinancePolicyCheck({
  policyPath = 'ops/finance-policy.json',
  log = console.log,
} = {}) {
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  const result = validateFinancePolicy(policy);
  log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) {
    throw new Error(`Finance policy check failed (${result.failures.length})`);
  }
  return result;
}

if (isMainModule(import.meta.url)) {
  runFinancePolicyCheck().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Finance policy check failed');
    process.exitCode = 1;
  });
}
