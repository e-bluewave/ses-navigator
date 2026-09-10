import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { isMainModule } from './cli-entry.mjs';

const defaultUrlEnvironmentVariable = 'SESN_STORAGE_BACKUP_URL';
const defaultKeyEnvironmentVariable = 'SESN_STORAGE_BACKUP_SERVICE_ROLE_KEY';
const allowedEnvironments = new Set(['Staging', 'Production']);
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function validateStorageBackupCaptureRequest({
  environment,
  repoRoot,
  outputDir,
  databaseManifestPath,
  sourceUrl,
  serviceRoleKey,
} = {}) {
  const findings = [];
  if (!allowedEnvironments.has(environment)) {
    findings.push('environment-must-be-staging-or-production');
  }
  if (!isNonBlankString(repoRoot)) findings.push('repo-root-required');
  if (!isNonBlankString(outputDir)) findings.push('output-dir-required');
  if (!isNonBlankString(databaseManifestPath)) {
    findings.push('database-capture-manifest-path-required');
  }
  if (!isNonBlankString(sourceUrl)) {
    findings.push('storage-url-runtime-secret-required');
  } else {
    try {
      validateSourceStorageUrl(sourceUrl);
    } catch {
      findings.push('storage-url-must-be-https-or-loopback-http');
    }
  }
  if (!isNonBlankString(serviceRoleKey)) {
    findings.push('storage-service-role-key-runtime-secret-required');
  }
  if (
    isNonBlankString(repoRoot) &&
    isNonBlankString(outputDir) &&
    isPathInside(resolve(repoRoot), resolve(outputDir))
  ) {
    findings.push('storage-backup-output-must-be-outside-repository');
  }
  return {
    status:
      findings.length === 0
        ? 'STORAGE_BACKUP_CAPTURE_REQUEST_PASSED'
        : 'STORAGE_BACKUP_CAPTURE_REQUEST_FAILED',
    complete: findings.length === 0,
    findings,
  };
}

export function validateSourceStorageUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Storage source URL must be a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Storage source URL must use HTTP or HTTPS');
  }
  if (url.protocol !== 'https:' && !loopbackHosts.has(url.hostname)) {
    throw new Error('Remote Storage backup source must use HTTPS');
  }
  url.pathname = url.pathname.replace(/\/$/u, '');
  return url;
}

export function validateDatabaseCaptureManifestForStorage(
  document,
  expectedEnvironment,
) {
  const findings = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return failedDatabaseManifest('database-capture-manifest-object-required');
  }
  if (document.version !== 1)
    findings.push('database-capture-version-must-be-1');
  if (document.environment !== expectedEnvironment) {
    findings.push('database-and-storage-environments-must-match');
  }
  if (!isNonBlankString(document.backupRunId)) {
    findings.push('database-backup-run-id-required');
  }
  if (!isValidTimestamp(document.startedAt)) {
    findings.push('database-recovery-point-started-at-required');
  }
  if (document.secretFreeManifest !== true) {
    findings.push('database-capture-manifest-must-be-secret-free');
  }
  if (document.requiredStorageDataExclusionsApplied !== true) {
    findings.push('database-storage-data-exclusions-required');
  }
  if (
    !document.migrationBaseline ||
    typeof document.migrationBaseline !== 'object' ||
    Array.isArray(document.migrationBaseline)
  ) {
    findings.push('database-migration-baseline-required');
  }
  if (
    !document.applicationSchemaBaseline ||
    typeof document.applicationSchemaBaseline !== 'object' ||
    Array.isArray(document.applicationSchemaBaseline)
  ) {
    findings.push('database-application-schema-baseline-required');
  }
  return {
    status:
      findings.length === 0
        ? 'DATABASE_CAPTURE_MANIFEST_FOR_STORAGE_PASSED'
        : 'DATABASE_CAPTURE_MANIFEST_FOR_STORAGE_FAILED',
    complete: findings.length === 0,
    findings,
    databaseBackupRunId: document.backupRunId,
    databaseRecoveryPointAt: document.startedAt,
  };
}

export function evaluateStorageSnapshotStability({
  initialIdentities,
  finalIdentities,
  contentMismatchCount,
} = {}) {
  const findings = [];
  if (!Array.isArray(initialIdentities) || !Array.isArray(finalIdentities)) {
    findings.push('storage-inventory-arrays-required');
  }
  const initial = new Set(initialIdentities ?? []);
  const final = new Set(finalIdentities ?? []);
  const missingIdentityCount = [...initial].filter(
    (identity) => !final.has(identity),
  ).length;
  const extraIdentityCount = [...final].filter(
    (identity) => !initial.has(identity),
  ).length;
  if (initial.size === 0) {
    findings.push('at-least-one-retained-storage-object-required');
  }
  if (missingIdentityCount !== 0)
    findings.push('storage-inventory-changed-missing');
  if (extraIdentityCount !== 0)
    findings.push('storage-inventory-changed-extra');
  if (!Number.isInteger(contentMismatchCount) || contentMismatchCount < 0) {
    findings.push('storage-content-mismatch-count-invalid');
  } else if (contentMismatchCount !== 0) {
    findings.push('storage-object-content-changed-during-capture');
  }
  return {
    status:
      findings.length === 0
        ? 'STORAGE_SNAPSHOT_STABILITY_PASSED'
        : 'STORAGE_SNAPSHOT_STABILITY_FAILED',
    complete: findings.length === 0,
    findings,
    missingIdentityCount,
    extraIdentityCount,
    contentMismatchCount,
  };
}

export function buildStorageBackupCaptureManifest({
  environment,
  databaseFacts,
  startedAt,
  completedAt,
  buckets,
  objects,
} = {}) {
  const databaseTime = Date.parse(databaseFacts.databaseRecoveryPointAt);
  const storageTime = Date.parse(startedAt);
  if (Number.isNaN(databaseTime) || Number.isNaN(storageTime)) {
    throw new Error('Valid DB and Storage recovery points are required');
  }
  const totalBytes = objects.reduce((sum, object) => sum + object.sizeBytes, 0);
  return {
    version: 1,
    backupRunId: `BA007-STORAGE-CAPTURE-${formatRunTimestamp(startedAt)}`,
    environment,
    startedAt,
    completedAt,
    databaseBackupRunId: databaseFacts.databaseBackupRunId,
    databaseRecoveryPointAt: databaseFacts.databaseRecoveryPointAt,
    storageRecoveryPointAt: startedAt,
    recoveryPointSkewMinutesMeasured: roundMinutes(
      Math.abs(storageTime - databaseTime) / 60000,
    ),
    databaseBackupRunLinked: true,
    databaseRecoveryPointRecorded: true,
    storageRecoveryPointRecorded: true,
    jointRecoveryPointEstablished: true,
    allFileBucketsIncluded: true,
    bucketAndObjectKeyPreserved: true,
    sourceBucketCount: buckets.length,
    sourceObjectCount: objects.length,
    backedUpObjectCount: objects.length,
    sourceTotalBytes: totalBytes,
    backedUpTotalBytes: totalBytes,
    integrityVerification: 'sha256-and-second-read',
    transferErrorCount: 0,
    allTransferErrorsRetried: true,
    businessObjectClassification: 'conservative-unclaimed',
    businessObjectCountClaimed: 0,
    restoreManifestFileName: 'storage-restore-manifest.private.json',
    snapshotDirectoryName: 'snapshot',
    credentialExposed: false,
    objectDataExposed: false,
    secretFreeManifest: true,
  };
}

export async function runStorageBackupCapture({
  environment,
  repoRoot = '.',
  outputDir,
  databaseManifestPath,
  sourceUrl = process.env[defaultUrlEnvironmentVariable],
  serviceRoleKey = process.env[defaultKeyEnvironmentVariable],
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  log = console.log,
} = {}) {
  const request = validateStorageBackupCaptureRequest({
    environment,
    repoRoot,
    outputDir,
    databaseManifestPath,
    sourceUrl,
    serviceRoleKey,
  });
  if (!request.complete) {
    log(safeFailureOutput(request.status, request.findings));
    throw new Error(
      `Storage backup capture request failed (${request.findings.length})`,
    );
  }
  if (typeof fetchImpl !== 'function')
    throw new Error('fetch implementation required');

  const resolvedOutputDir = resolve(outputDir);
  await assertPathDoesNotExist(resolvedOutputDir);

  const databaseManifestText = await readFile(databaseManifestPath, 'utf8');
  assertBomFree(databaseManifestText, 'Database capture manifest');
  const databaseFacts = validateDatabaseCaptureManifestForStorage(
    JSON.parse(databaseManifestText),
    environment,
  );
  if (!databaseFacts.complete) {
    log(safeFailureOutput(databaseFacts.status, databaseFacts.findings));
    throw new Error(
      `Database capture manifest failed (${databaseFacts.findings.length})`,
    );
  }

  const baseUrl = validateSourceStorageUrl(sourceUrl);
  const client = createStorageReadClient({
    baseUrl,
    serviceRoleKey,
    fetchImpl,
  });
  const startedAt = now().toISOString();
  const rawBuckets = await client.listBuckets();
  const buckets = normalizeBuckets(rawBuckets);
  const initialObjects = [];
  for (const bucket of buckets) {
    const listed = await client.listObjectsRecursive(bucket.id);
    for (const item of listed) {
      assertSafeStorageIdentity(bucket.id, item.key);
      initialObjects.push({ bucket: bucket.id, key: item.key });
    }
  }
  initialObjects.sort(compareStorageObjects);

  if (initialObjects.length === 0) {
    const stability = evaluateStorageSnapshotStability({
      initialIdentities: [],
      finalIdentities: [],
      contentMismatchCount: 0,
    });
    log(safeFailureOutput(stability.status, stability.findings));
    throw new Error(
      'Storage source has no retained object; create a governed validation object before BA-007 capture',
    );
  }

  await mkdir(resolvedOutputDir, { recursive: true });
  const snapshotRoot = resolve(resolvedOutputDir, 'snapshot');
  await mkdir(snapshotRoot, { recursive: true });
  const capturedObjects = [];
  for (const object of initialObjects) {
    const bytes = await client.downloadObject(object.bucket, object.key);
    const sourcePath = storageRelativePath(object.bucket, object.key);
    const targetPath = resolveWithinSnapshot(snapshotRoot, sourcePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, bytes);
    capturedObjects.push({
      bucket: object.bucket,
      key: object.key,
      sizeBytes: bytes.byteLength,
      sha256: sha256Hex(bytes),
      sourcePath,
      businessObject: false,
    });
  }

  const finalObjects = [];
  for (const bucket of buckets) {
    const listed = await client.listObjectsRecursive(bucket.id);
    for (const item of listed) {
      assertSafeStorageIdentity(bucket.id, item.key);
      finalObjects.push({ bucket: bucket.id, key: item.key });
    }
  }
  finalObjects.sort(compareStorageObjects);

  let contentMismatchCount = 0;
  for (const object of capturedObjects) {
    const secondRead = await client.downloadObject(object.bucket, object.key);
    if (
      secondRead.byteLength !== object.sizeBytes ||
      sha256Hex(secondRead) !== object.sha256
    ) {
      contentMismatchCount += 1;
    }
  }

  const stability = evaluateStorageSnapshotStability({
    initialIdentities: initialObjects.map(storageIdentityFromObject),
    finalIdentities: finalObjects.map(storageIdentityFromObject),
    contentMismatchCount,
  });
  if (!stability.complete) {
    log(safeFailureOutput(stability.status, stability.findings));
    throw new Error(
      `Storage snapshot changed during capture (${stability.findings.length})`,
    );
  }

  const restoreManifest = {
    version: 1,
    buckets,
    objects: capturedObjects,
  };
  const restoreManifestPath = resolve(
    resolvedOutputDir,
    'storage-restore-manifest.private.json',
  );
  await writeFile(
    restoreManifestPath,
    `${JSON.stringify(restoreManifest, null, 2)}\n`,
    'utf8',
  );

  const completedAt = now().toISOString();
  const captureManifest = buildStorageBackupCaptureManifest({
    environment,
    databaseFacts,
    startedAt,
    completedAt,
    buckets,
    objects: capturedObjects,
  });
  const captureManifestPath = resolve(
    resolvedOutputDir,
    'storage-backup-capture.private.json',
  );
  await writeFile(
    captureManifestPath,
    `${JSON.stringify(captureManifest, null, 2)}\n`,
    'utf8',
  );

  const result = {
    status: 'STORAGE_BACKUP_CAPTURE_PASSED',
    complete: true,
    environment,
    sourceBucketCount: buckets.length,
    sourceObjectCount: capturedObjects.length,
    sourceTotalBytes: captureManifest.sourceTotalBytes,
    recoveryPointSkewMinutesMeasured:
      captureManifest.recoveryPointSkewMinutesMeasured,
    secondReadIntegrityVerified: true,
    restoreManifestWritten: true,
    captureManifestWritten: true,
    businessFileBackupClaimed: false,
    secretFreeOutput: true,
  };
  log(JSON.stringify(result, null, 2));
  return { ...result, captureManifest, restoreManifest };
}

function createStorageReadClient({ baseUrl, serviceRoleKey, fetchImpl }) {
  const storageBase = new URL('/storage/v1/', baseUrl);
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  async function request(path, options = {}) {
    const response = await fetchImpl(new URL(path, storageBase), {
      ...options,
      headers: { ...headers, ...(options.headers ?? {}) },
    });
    if (!response.ok) {
      throw new Error(`Storage API request failed (${response.status})`);
    }
    return response;
  }

  return {
    async listBuckets() {
      const response = await request('bucket');
      const body = await response.json();
      return Array.isArray(body) ? body : [];
    },
    async listObjectsRecursive(bucket) {
      const results = [];
      const prefixes = [''];
      const visitedPrefixes = new Set();
      while (prefixes.length > 0) {
        const prefix = prefixes.shift();
        if (visitedPrefixes.has(prefix)) continue;
        visitedPrefixes.add(prefix);
        let offset = 0;
        while (true) {
          const response = await request(`object/list/${encodePath(bucket)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix, limit: 1000, offset }),
          });
          const body = await response.json();
          const entries = Array.isArray(body) ? body : [];
          for (const entry of entries) {
            if (!entry || typeof entry.name !== 'string') continue;
            const key = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.id === null || entry.id === undefined) {
              prefixes.push(key);
            } else {
              results.push({ key });
            }
          }
          if (entries.length < 1000) break;
          offset += entries.length;
        }
      }
      return results;
    },
    async downloadObject(bucket, key) {
      const response = await request(
        `object/${encodePath(bucket)}/${encodePath(key)}`,
      );
      return Buffer.from(await response.arrayBuffer());
    },
  };
}

function normalizeBuckets(rawBuckets) {
  if (!Array.isArray(rawBuckets)) return [];
  return rawBuckets
    .filter((bucket) => bucket && isNonBlankString(bucket.id))
    .map((bucket) => ({
      id: bucket.id.trim(),
      public: bucket.public === true,
      fileSizeLimit: firstNonNegativeInteger(
        bucket.file_size_limit,
        bucket.fileSizeLimit,
      ),
      allowedMimeTypes: Array.isArray(bucket.allowed_mime_types)
        ? bucket.allowed_mime_types.filter((value) => typeof value === 'string')
        : Array.isArray(bucket.allowedMimeTypes)
          ? bucket.allowedMimeTypes.filter((value) => typeof value === 'string')
          : null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function assertSafeStorageIdentity(bucket, key) {
  if (!isNonBlankString(bucket) || !isNonBlankString(key)) {
    throw new Error('Storage bucket and object key are required');
  }
  if (containsTraversal(bucket) || containsTraversal(key)) {
    throw new Error('Storage identity traversal is not allowed');
  }
  if (bucket.includes('/') || bucket.includes('\\')) {
    throw new Error(
      'Storage bucket identifier must not contain path separators',
    );
  }
}

function storageRelativePath(bucket, key) {
  const identity = `${bucket}\u0000${key}`;
  return `objects/${sha256Hex(Buffer.from(identity, 'utf8'))}.bin`;
}

function resolveWithinSnapshot(root, candidate) {
  if (
    !isNonBlankString(candidate) ||
    isAbsolute(candidate) ||
    containsTraversal(candidate)
  ) {
    throw new Error(
      'Storage snapshot path must be relative and traversal-free',
    );
  }
  const rootPath = resolve(root);
  const candidatePath = resolve(rootPath, candidate);
  const rel = relative(rootPath, candidatePath);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('Storage snapshot path escaped output root');
  }
  return candidatePath;
}

function compareStorageObjects(left, right) {
  return storageIdentityFromObject(left).localeCompare(
    storageIdentityFromObject(right),
  );
}

function storageIdentityFromObject(object) {
  return `${object.bucket}\u0000${object.key}`;
}

function encodePath(value) {
  return String(value)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function containsTraversal(value) {
  return String(value)
    .replaceAll('\\', '/')
    .split('/')
    .some((segment) => segment === '..');
}

function firstNonNegativeInteger(...values) {
  for (const value of values) {
    if (Number.isInteger(value) && value >= 0) return value;
  }
  return null;
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeFailureOutput(status, findings) {
  return JSON.stringify(
    {
      status,
      findingCount: findings.length,
      findings,
      secretFreeOutput: true,
    },
    null,
    2,
  );
}

async function assertPathDoesNotExist(path) {
  try {
    await access(path);
  } catch {
    return;
  }
  throw new Error(
    'Storage backup output already exists; use a fresh output directory',
  );
}

function assertBomFree(text, label) {
  if (typeof text !== 'string') throw new Error(`${label} must be UTF-8 text`);
  if (text.charCodeAt(0) === 0xfeff) {
    throw new Error(`${label} must be UTF-8 without BOM`);
  }
}

function isPathInside(parent, candidate) {
  const rel = relative(parent, candidate);
  return (
    rel === '' ||
    (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
  );
}

function isValidTimestamp(value) {
  return isNonBlankString(value) && !Number.isNaN(Date.parse(value));
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function roundMinutes(value) {
  return Math.round(value * 10000) / 10000;
}

function formatRunTimestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new Error('Invalid Storage backup start time');
  return parsed
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z');
}

function failedDatabaseManifest(rule) {
  return {
    status: 'DATABASE_CAPTURE_MANIFEST_FOR_STORAGE_FAILED',
    complete: false,
    findings: [rule],
    databaseBackupRunId: null,
    databaseRecoveryPointAt: null,
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
  runStorageBackupCapture({
    environment: args.environment,
    repoRoot: args['repo-root'] ?? process.cwd(),
    outputDir: args['output-dir'],
    databaseManifestPath: args['database-manifest'],
  }).catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Storage backup capture failed',
    );
    process.exitCode = 1;
  });
}
