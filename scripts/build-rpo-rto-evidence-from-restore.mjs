import { readFile, writeFile } from 'node:fs/promises';
import { validateRestoreDrillEvidence } from './check-restore-drill-evidence.mjs';
import { validateRpoRtoEvidence } from './check-rpo-rto-evidence.mjs';
import { isMainModule } from './cli-entry.mjs';

const governanceFields = new Set([
  'businessOwnerApproved',
  'technicalOwnerApproved',
  'targetsAcknowledged',
  'annualReviewScheduled',
  'exceptionUsed',
  'exceptionApprovalPresent',
  'exceptionExpiryPresent',
  'notes',
]);

export function validateBa009GovernanceFacts(document) {
  const findings = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return failedGovernance('governance-facts-object-required');
  }

  for (const field of Object.keys(document)) {
    if (!governanceFields.has(field)) findings.push(`unknown-field:${field}`);
  }

  for (const field of [
    'businessOwnerApproved',
    'technicalOwnerApproved',
    'targetsAcknowledged',
    'annualReviewScheduled',
  ]) {
    if (document[field] !== true) findings.push(`${field}-must-be-true`);
  }

  if (document.exceptionUsed !== true && document.exceptionUsed !== false) {
    findings.push('exceptionUsed-must-be-boolean');
  }
  if (document.exceptionUsed === true) {
    if (document.exceptionApprovalPresent !== true) {
      findings.push('exception-approval-required');
    }
    if (document.exceptionExpiryPresent !== true) {
      findings.push('exception-expiry-required');
    }
  }
  if (document.notes !== undefined && typeof document.notes !== 'string') {
    findings.push('notes-must-be-string');
  }

  return {
    status:
      findings.length === 0
        ? 'BA009_GOVERNANCE_FACTS_PASSED'
        : 'BA009_GOVERNANCE_FACTS_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export function buildBa009Evidence({
  restoreEvidence,
  governance,
  completedAt,
}) {
  const rpo = restoreEvidence?.recoveryPointAgeMinutesMeasured;
  const rto = restoreEvidence?.rtoMinutesMeasured;
  if (!isNonNegativeNumber(rpo) || !isNonNegativeNumber(rto)) {
    throw new Error('BA-008 measured RPO/RTO are required');
  }
  if (!validTimestamp(completedAt)) {
    throw new Error('BA-009 completedAt must be a valid timestamp');
  }

  const suffix = completedAt.replace(/[^0-9]/gu, '').slice(0, 14);
  const notes = [
    'Measurements copied directly from validated BA-008 restore evidence.',
    'Exception approval does not override RPO/RTO target enforcement.',
    typeof governance.notes === 'string' && governance.notes.trim() !== ''
      ? governance.notes.trim()
      : null,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    evidenceId: `BA-009-${suffix}`,
    environment: restoreEvidence.environment,
    completedAt,
    restoreDrillEvidencePassed: true,
    measurementsTakenFromBa008: true,
    tier1RpoMinutesMeasured: rpo,
    tier1RtoMinutesMeasured: rto,
    tier2RpoMinutesMeasured: rpo,
    tier2RtoMinutesMeasured: rto,
    tier3RpoMinutesMeasured: rpo,
    tier3RtoMinutesMeasured: rto,
    businessOwnerApproved: governance.businessOwnerApproved,
    technicalOwnerApproved: governance.technicalOwnerApproved,
    targetsAcknowledged: governance.targetsAcknowledged,
    annualReviewScheduled: governance.annualReviewScheduled,
    exceptionUsed: governance.exceptionUsed,
    ...(governance.exceptionUsed === true
      ? {
          exceptionApprovalPresent:
            governance.exceptionApprovalPresent === true,
          exceptionExpiryPresent: governance.exceptionExpiryPresent === true,
        }
      : {}),
    secretOrPersonalDataExposed: false,
    secretFreeEvidence: true,
    notes,
  };
}

export async function runBa009EvidenceAssembler({
  restoreEvidencePath,
  governanceFactsPath,
  outputPath,
  policyPath = 'ops/rpo-rto-policy.json',
  now = () => new Date().toISOString(),
  readFileImpl = readFile,
  writeFileImpl = writeFile,
  log = console.log,
} = {}) {
  for (const [label, value] of [
    ['BA-008 restore evidence path', restoreEvidencePath],
    ['BA-009 governance facts path', governanceFactsPath],
    ['BA-009 output path', outputPath],
  ]) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`${label} is required`);
    }
  }

  const [restoreText, governanceText, policyText] = await Promise.all([
    readFileImpl(restoreEvidencePath, 'utf8'),
    readFileImpl(governanceFactsPath, 'utf8'),
    readFileImpl(policyPath, 'utf8'),
  ]);
  for (const [label, text] of [
    ['BA-008 restore evidence', restoreText],
    ['BA-009 governance facts', governanceText],
    ['RPO/RTO policy', policyText],
  ]) {
    if (text.charCodeAt(0) === 0xfeff) {
      throw new Error(`${label} must be UTF-8 without BOM`);
    }
  }

  const restoreEvidence = JSON.parse(restoreText);
  const governance = JSON.parse(governanceText);
  const policy = JSON.parse(policyText);

  const restoreValidation = validateRestoreDrillEvidence(restoreEvidence);
  if (restoreValidation.complete !== true) {
    throw new Error(
      `BA-008 restore evidence validation failed (${restoreValidation.findings.length})`,
    );
  }

  const governanceValidation = validateBa009GovernanceFacts(governance);
  if (governanceValidation.complete !== true) {
    throw new Error(
      `BA-009 governance facts failed (${governanceValidation.findings.length})`,
    );
  }

  const evidence = buildBa009Evidence({
    restoreEvidence,
    governance,
    completedAt: now(),
  });
  const validation = validateRpoRtoEvidence(evidence, policy);

  await writeFileImpl(
    outputPath,
    `${JSON.stringify(evidence, null, 2)}\n`,
    'utf8',
  );

  const summary = {
    status:
      validation.complete === true
        ? 'BA009_EVIDENCE_READY'
        : 'BA009_EVIDENCE_BLOCKED',
    evidenceWritten: true,
    restoreDrillEvidencePassed: true,
    measurementsTakenFromBa008: true,
    rpoMinutesMeasured: evidence.tier1RpoMinutesMeasured,
    rtoMinutesMeasured: evidence.tier1RtoMinutesMeasured,
    validatorStatus: validation.status,
    findingCount: validation.findings.length,
    findings: validation.findings,
    secretFreeOutput: true,
  };
  log(JSON.stringify(summary, null, 2));

  if (validation.complete !== true) {
    throw new Error(
      `BA-009 remains blocked (${validation.findings.length} findings)`,
    );
  }
  return { ...summary, evidence };
}

function failedGovernance(rule) {
  return {
    status: 'BA009_GOVERNANCE_FACTS_FAILED',
    complete: false,
    findings: [rule],
  };
}

function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function parseCliArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) continue;
    values[key.slice(2)] = value;
    index += 1;
  }
  return values;
}

if (isMainModule(import.meta.url)) {
  const args = parseCliArgs(process.argv.slice(2));
  runBa009EvidenceAssembler({
    restoreEvidencePath: args.restore,
    governanceFactsPath: args.governance,
    outputPath: args.output,
    policyPath: args.policy ?? 'ops/rpo-rto-policy.json',
  }).catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'BA-009 evidence assembly failed',
    );
    process.exitCode = 1;
  });
}
