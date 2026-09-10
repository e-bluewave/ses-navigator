import { readFile, writeFile } from 'node:fs/promises';
import { validateDatabaseBackupEvidence } from './check-database-backup-evidence.mjs';
import { validateStorageBackupEvidence } from './check-storage-backup-evidence.mjs';
import { isMainModule } from './cli-entry.mjs';

const allowedPreparationFields = new Set([
  'repoRoot',
  'databaseBackupEvidencePath',
  'storageBackupEvidencePath',
  'followUpReferencePresent',
  'db',
  'storage',
  'notes',
]);
const allowedDbFields = new Set([
  'factsPath',
  'rolesPath',
  'schemaPath',
  'dataPath',
  'containerName',
  'requiredNameToken',
]);
const allowedStorageFields = new Set([
  'manifestPath',
  'sourceRoot',
  'cleanupExisting',
]);
const requiredPathFields = [
  'repoRoot',
  'databaseBackupEvidencePath',
  'storageBackupEvidencePath',
];
const skewToleranceMinutes = 0.05;

export function validatePreparationInput(document) {
  const findings = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return failed('preparation-input-object-required');
  }

  for (const key of Object.keys(document)) {
    if (!allowedPreparationFields.has(key))
      findings.push(`unknown-field:${key}`);
  }
  for (const field of requiredPathFields) {
    if (!isNonBlankString(document[field])) {
      findings.push(`required-field-missing:${field}`);
    }
  }
  if (typeof document.followUpReferencePresent !== 'boolean') {
    findings.push('followUpReferencePresent-must-be-boolean');
  }
  validateNestedObject(
    document.db,
    'db',
    allowedDbFields,
    [
      'factsPath',
      'rolesPath',
      'schemaPath',
      'dataPath',
      'containerName',
      'requiredNameToken',
    ],
    findings,
  );
  validateNestedObject(
    document.storage,
    'storage',
    allowedStorageFields,
    ['manifestPath', 'sourceRoot'],
    findings,
  );
  if (
    document.storage &&
    typeof document.storage === 'object' &&
    typeof document.storage.cleanupExisting !== 'boolean'
  ) {
    findings.push('storage.cleanupExisting-must-be-boolean');
  }
  if (document.notes !== undefined && typeof document.notes !== 'string') {
    findings.push('notes-must-be-string');
  }

  return {
    status:
      findings.length === 0
        ? 'RESTORE_RUN_FACTS_PREPARATION_INPUT_PASSED'
        : 'RESTORE_RUN_FACTS_PREPARATION_INPUT_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export function deriveRecoveryPointFacts(databaseEvidence, storageEvidence) {
  const findings = [];
  const databaseValidation = validateDatabaseBackupEvidence(databaseEvidence);
  const storageValidation = validateStorageBackupEvidence(storageEvidence);
  if (!databaseValidation.complete) {
    findings.push('database-backup-evidence-invalid');
  }
  if (!storageValidation.complete) {
    findings.push('storage-backup-evidence-invalid');
  }

  const databaseRecoveryPointAt = databaseEvidence?.startedAt;
  const storageRecoveryPointAt = storageEvidence?.startedAt;
  const databaseTime = Date.parse(databaseRecoveryPointAt ?? '');
  const storageTime = Date.parse(storageRecoveryPointAt ?? '');
  const calculatedSkew =
    Number.isNaN(databaseTime) || Number.isNaN(storageTime)
      ? null
      : Math.abs(storageTime - databaseTime) / 60000;

  if (
    databaseValidation.complete &&
    storageValidation.complete &&
    databaseEvidence.environment !== storageEvidence.environment
  ) {
    findings.push('backup-environments-must-match');
  }
  if (storageEvidence?.databaseBackupRunLinked !== true) {
    findings.push('storage-database-backup-link-required');
  }
  if (storageEvidence?.databaseRecoveryPointRecorded !== true) {
    findings.push('database-recovery-point-record-required');
  }
  if (storageEvidence?.storageRecoveryPointRecorded !== true) {
    findings.push('storage-recovery-point-record-required');
  }
  if (storageEvidence?.jointRecoveryPointEstablished !== true) {
    findings.push('joint-recovery-point-required');
  }

  const recordedSkew = storageEvidence?.recoveryPointSkewMinutesMeasured;
  if (
    calculatedSkew === null ||
    typeof recordedSkew !== 'number' ||
    !Number.isFinite(recordedSkew) ||
    Math.abs(calculatedSkew - recordedSkew) > skewToleranceMinutes
  ) {
    findings.push('recovery-point-skew-does-not-match-evidence');
  }

  return {
    status:
      findings.length === 0
        ? 'RESTORE_RECOVERY_POINT_FACTS_PASSED'
        : 'RESTORE_RECOVERY_POINT_FACTS_FAILED',
    complete: findings.length === 0,
    findings,
    databaseRecoveryPointAt,
    storageRecoveryPointAt,
    recoveryPointSkewMinutesCalculated:
      calculatedSkew === null ? null : roundMinutes(calculatedSkew),
    databaseBackupRunLinked: findings.length === 0,
    storageBackupRunLinked: findings.length === 0,
    restorePointAlignment: findings.length === 0 ? 'PASS' : 'FAIL',
  };
}

export function buildRunFacts(preparation, recoveryPointFacts) {
  if (recoveryPointFacts?.complete !== true) {
    throw new Error(
      'Recovery point facts must pass before run-facts generation',
    );
  }
  return {
    environment: 'Disposable',
    repoRoot: preparation.repoRoot,
    databaseRecoveryPointAt: recoveryPointFacts.databaseRecoveryPointAt,
    storageRecoveryPointAt: recoveryPointFacts.storageRecoveryPointAt,
    databaseBackupRunLinked: recoveryPointFacts.databaseBackupRunLinked,
    storageBackupRunLinked: recoveryPointFacts.storageBackupRunLinked,
    restorePointAlignment: recoveryPointFacts.restorePointAlignment,
    followUpReferencePresent: preparation.followUpReferencePresent,
    db: {
      factsPath: preparation.db.factsPath,
      rolesPath: preparation.db.rolesPath,
      schemaPath: preparation.db.schemaPath,
      dataPath: preparation.db.dataPath,
      containerName: preparation.db.containerName,
      requiredNameToken: preparation.db.requiredNameToken,
    },
    storage: {
      manifestPath: preparation.storage.manifestPath,
      sourceRoot: preparation.storage.sourceRoot,
      cleanupExisting: preparation.storage.cleanupExisting,
    },
    notes:
      typeof preparation.notes === 'string'
        ? preparation.notes
        : 'Recovery points derived from validated BA-006/BA-007 evidence.',
  };
}

export async function runPrepareLocalRestoreRunFacts({
  preparationPath,
  outputPath,
  readFileImpl = readFile,
  writeFileImpl = writeFile,
  log = console.log,
} = {}) {
  if (!isNonBlankString(preparationPath)) {
    throw new Error('Preparation input path is required');
  }
  if (!isNonBlankString(outputPath)) {
    throw new Error('Run-facts output path is required');
  }

  const preparationText = await readFileImpl(preparationPath, 'utf8');
  assertBomFree(preparationText, 'Preparation input');
  const preparation = JSON.parse(preparationText);
  const preparationValidation = validatePreparationInput(preparation);
  if (!preparationValidation.complete) {
    throw new Error(
      `Preparation input failed (${preparationValidation.findings.length})`,
    );
  }

  const [databaseText, storageText] = await Promise.all([
    readFileImpl(preparation.databaseBackupEvidencePath, 'utf8'),
    readFileImpl(preparation.storageBackupEvidencePath, 'utf8'),
  ]);
  assertBomFree(databaseText, 'BA-006 evidence');
  assertBomFree(storageText, 'BA-007 evidence');

  const databaseEvidence = JSON.parse(databaseText);
  const storageEvidence = JSON.parse(storageText);
  const recoveryPointFacts = deriveRecoveryPointFacts(
    databaseEvidence,
    storageEvidence,
  );
  if (!recoveryPointFacts.complete) {
    log(
      JSON.stringify(
        {
          status: recoveryPointFacts.status,
          findingCount: recoveryPointFacts.findings.length,
          findings: recoveryPointFacts.findings,
          secretFreeOutput: true,
        },
        null,
        2,
      ),
    );
    throw new Error(
      `Recovery point derivation failed (${recoveryPointFacts.findings.length})`,
    );
  }

  const runFacts = buildRunFacts(preparation, recoveryPointFacts);
  await writeFileImpl(
    outputPath,
    `${JSON.stringify(runFacts, null, 2)}\n`,
    'utf8',
  );

  const result = {
    status: 'RESTORE_RUN_FACTS_PREPARED',
    complete: true,
    databaseBackupEvidenceValidated: true,
    storageBackupEvidenceValidated: true,
    recoveryPointSkewMinutesCalculated:
      recoveryPointFacts.recoveryPointSkewMinutesCalculated,
    restorePointAlignment: 'PASS',
    outputWritten: true,
    secretFreeOutput: true,
  };
  log(JSON.stringify(result, null, 2));
  return { ...result, runFacts };
}

function validateNestedObject(
  document,
  label,
  allowedFields,
  requiredFields,
  findings,
) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    findings.push(`${label}-object-required`);
    return;
  }
  for (const key of Object.keys(document)) {
    if (!allowedFields.has(key)) findings.push(`unknown-field:${label}.${key}`);
  }
  for (const field of requiredFields) {
    if (!isNonBlankString(document[field])) {
      findings.push(`required-field-missing:${label}.${field}`);
    }
  }
}

function assertBomFree(text, label) {
  if (typeof text !== 'string') throw new Error(`${label} must be UTF-8 text`);
  if (text.charCodeAt(0) === 0xfeff) {
    throw new Error(`${label} must be UTF-8 without BOM`);
  }
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function roundMinutes(value) {
  return Math.round(value * 10000) / 10000;
}

function failed(rule) {
  return {
    status: 'RESTORE_RUN_FACTS_PREPARATION_INPUT_FAILED',
    complete: false,
    findings: [rule],
  };
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
  runPrepareLocalRestoreRunFacts({
    preparationPath: args.input,
    outputPath: args.output,
  }).catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Run-facts preparation failed',
    );
    process.exitCode = 1;
  });
}
