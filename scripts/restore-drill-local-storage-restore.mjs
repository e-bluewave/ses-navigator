import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { isMainModule } from './cli-entry.mjs';

const defaultUrlEnvironmentVariable = 'SESN_RESTORE_STORAGE_URL';
const defaultKeyEnvironmentVariable = 'SESN_RESTORE_STORAGE_SERVICE_ROLE_KEY';
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function normalizeRestoreStorageManifest(document) {
  const findings = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return failedManifest('manifest-object-required');
  }

  const rawObjects = Array.isArray(document.objects) ? document.objects : [];
  const objects = [];
  const identitySet = new Set();

  for (const [index, rawObject] of rawObjects.entries()) {
    if (
      !rawObject ||
      typeof rawObject !== 'object' ||
      Array.isArray(rawObject)
    ) {
      findings.push(`object-${index}-must-be-object`);
      continue;
    }

    const bucket = firstString(
      rawObject.bucket,
      rawObject.bucketId,
      rawObject.bucket_id,
    );
    const key = firstString(
      rawObject.key,
      rawObject.objectKey,
      rawObject.object_key,
      rawObject.name,
    );
    const sha256 = normalizeSha256(
      firstString(
        rawObject.sha256,
        rawObject.checksumSha256,
        rawObject.checksum_sha256,
        rawObject.checksum,
      ),
    );
    const sizeBytes = firstNonNegativeInteger(
      rawObject.sizeBytes,
      rawObject.size_bytes,
      rawObject.size,
      rawObject.bytes,
    );
    const sourcePath = firstString(
      rawObject.sourcePath,
      rawObject.source_path,
      rawObject.localPath,
      rawObject.local_path,
    );
    const businessObject =
      rawObject.businessObject === true || rawObject.business_object === true;

    if (!bucket) findings.push(`object-${index}-bucket-required`);
    if (!key) findings.push(`object-${index}-key-required`);
    if (sizeBytes === null) findings.push(`object-${index}-size-required`);
    if (!sha256) findings.push(`object-${index}-sha256-required`);
    if (sourcePath && isAbsolute(sourcePath)) {
      findings.push(`object-${index}-source-path-must-be-relative`);
    }
    if (sourcePath && containsTraversal(sourcePath)) {
      findings.push(`object-${index}-source-path-traversal-not-allowed`);
    }
    if (key && containsTraversal(key)) {
      findings.push(`object-${index}-key-traversal-not-allowed`);
    }

    if (bucket && key) {
      const identity = `${bucket}\u0000${key}`;
      if (identitySet.has(identity)) {
        findings.push(`object-${index}-duplicate-bucket-key`);
      }
      identitySet.add(identity);
    }

    objects.push({
      bucket,
      key,
      sha256,
      sizeBytes,
      sourcePath,
      businessObject,
    });
  }

  const bucketSettings = new Map();
  for (const rawBucket of Array.isArray(document.buckets)
    ? document.buckets
    : []) {
    if (
      !rawBucket ||
      typeof rawBucket !== 'object' ||
      Array.isArray(rawBucket)
    ) {
      findings.push('bucket-entry-must-be-object');
      continue;
    }
    const id = firstString(rawBucket.id, rawBucket.bucket, rawBucket.name);
    if (!id) {
      findings.push('bucket-id-required');
      continue;
    }
    bucketSettings.set(id, {
      id,
      public: rawBucket.public === true,
      fileSizeLimit: firstNonNegativeInteger(
        rawBucket.fileSizeLimit,
        rawBucket.file_size_limit,
      ),
      allowedMimeTypes: Array.isArray(rawBucket.allowedMimeTypes)
        ? rawBucket.allowedMimeTypes.filter(
            (value) => typeof value === 'string',
          )
        : Array.isArray(rawBucket.allowed_mime_types)
          ? rawBucket.allowed_mime_types.filter(
              (value) => typeof value === 'string',
            )
          : null,
    });
  }

  for (const object of objects) {
    if (object.bucket && !bucketSettings.has(object.bucket)) {
      bucketSettings.set(object.bucket, {
        id: object.bucket,
        public: false,
        fileSizeLimit: null,
        allowedMimeTypes: null,
      });
    }
  }

  if (objects.length === 0)
    findings.push('at-least-one-restore-object-required');

  const businessObjectCount = objects.filter(
    (object) => object.businessObject,
  ).length;
  const complete = findings.length === 0;
  return {
    status: complete
      ? 'STORAGE_RESTORE_MANIFEST_PASSED'
      : 'STORAGE_RESTORE_MANIFEST_FAILED',
    complete,
    findings,
    buckets: [...bucketSettings.values()],
    objects,
    objectCount: objects.length,
    totalBytes: objects.reduce(
      (total, object) => total + (object.sizeBytes ?? 0),
      0,
    ),
    businessObjectCount,
  };
}

export function evaluateStorageRestoreResult({
  expectedObjectCount,
  expectedTotalBytes,
  uploadedObjectCount,
  downloadedObjectCount,
  verifiedTotalBytes,
  hashMismatchCount,
  sizeMismatchCount,
  missingObjectCount,
  extraObjectCount,
  metadataObjectCount,
  businessObjectCount,
}) {
  const findings = [];
  const integerFields = {
    expectedObjectCount,
    expectedTotalBytes,
    uploadedObjectCount,
    downloadedObjectCount,
    verifiedTotalBytes,
    hashMismatchCount,
    sizeMismatchCount,
    missingObjectCount,
    extraObjectCount,
    metadataObjectCount,
    businessObjectCount,
  };

  for (const [name, value] of Object.entries(integerFields)) {
    if (!Number.isInteger(value) || value < 0) {
      findings.push(`${name}-must-be-non-negative-integer`);
    }
  }

  if (uploadedObjectCount !== expectedObjectCount) {
    findings.push('uploaded-object-count-mismatch');
  }
  if (downloadedObjectCount !== expectedObjectCount) {
    findings.push('downloaded-object-count-mismatch');
  }
  if (verifiedTotalBytes !== expectedTotalBytes) {
    findings.push('verified-total-bytes-mismatch');
  }
  if (hashMismatchCount !== 0) findings.push('download-hash-mismatch');
  if (sizeMismatchCount !== 0) findings.push('download-size-mismatch');
  if (missingObjectCount !== 0) findings.push('storage-object-missing');
  if (extraObjectCount !== 0) findings.push('storage-object-extra');
  if (metadataObjectCount !== expectedObjectCount) {
    findings.push('storage-metadata-object-count-mismatch');
  }

  const complete = findings.length === 0;
  return {
    status: complete
      ? 'LOCAL_STORAGE_RESTORE_PASSED'
      : 'LOCAL_STORAGE_RESTORE_FAILED',
    complete,
    findings,
    storageRestore: complete ? 'PASS' : 'FAIL',
    storageObjectCountParity: complete ? 'PASS' : 'FAIL',
    storageTotalBytesParity: complete ? 'PASS' : 'FAIL',
    storageIntegrityVerification: complete ? 'PASS' : 'FAIL',
    storageInventoryVerification: complete ? 'PASS' : 'FAIL',
    representativeFileRead: downloadedObjectCount > 0 ? 'PASS' : 'FAIL',
    metadataRegeneratedCount: metadataObjectCount,
    expectedObjectCount,
    expectedTotalBytes,
    businessObjectCount,
    businessFileRestoreClaimed: complete && businessObjectCount > 0,
  };
}

export async function runLocalStorageRestore({
  manifestPath,
  sourceRoot,
  environment = 'Disposable',
  targetUrl = process.env[defaultUrlEnvironmentVariable],
  serviceRoleKey = process.env[defaultKeyEnvironmentVariable],
  cleanupExisting = false,
  fetchImpl = globalThis.fetch,
  readFileImpl = readFile,
  log = console.log,
} = {}) {
  if (!manifestPath)
    throw new Error('Storage restore manifest path is required');
  if (!sourceRoot) throw new Error('Storage restore source root is required');
  if (environment !== 'Disposable') {
    throw new Error('Local Storage restore requires Disposable environment');
  }
  if (typeof targetUrl !== 'string' || targetUrl.trim() === '') {
    throw new Error(`${defaultUrlEnvironmentVariable} is required`);
  }
  if (typeof serviceRoleKey !== 'string' || serviceRoleKey.trim() === '') {
    throw new Error(`${defaultKeyEnvironmentVariable} is required`);
  }
  if (typeof fetchImpl !== 'function')
    throw new Error('fetch implementation required');

  const baseUrl = validateLocalStorageUrl(targetUrl);
  const manifestText = await readFileImpl(manifestPath, 'utf8');
  if (manifestText.charCodeAt(0) === 0xfeff) {
    throw new Error('Storage restore manifest must be UTF-8 without BOM');
  }
  const manifest = normalizeRestoreStorageManifest(JSON.parse(manifestText));
  if (!manifest.complete) {
    throw new Error(
      `Storage restore manifest failed (${manifest.findings.length})`,
    );
  }

  const preparedObjects = [];
  for (const object of manifest.objects) {
    const relativePath =
      object.sourcePath ?? join(object.bucket, ...object.key.split('/'));
    const sourcePath = resolveWithinRoot(sourceRoot, relativePath);
    const bytes = await readFileImpl(sourcePath);
    const actualSha256 = sha256Hex(bytes);
    if (bytes.byteLength !== object.sizeBytes) {
      throw new Error('Storage snapshot source size mismatch');
    }
    if (actualSha256 !== object.sha256) {
      throw new Error('Storage snapshot source SHA-256 mismatch');
    }
    preparedObjects.push({ ...object, bytes });
  }

  const client = createStorageApiClient({
    baseUrl,
    serviceRoleKey,
    fetchImpl,
  });

  const existingBuckets = await client.listBuckets();
  const existingBucketIds = new Set(existingBuckets.map((bucket) => bucket.id));
  for (const bucket of manifest.buckets) {
    if (!existingBucketIds.has(bucket.id)) await client.createBucket(bucket);
  }

  if (cleanupExisting) {
    for (const bucket of manifest.buckets) {
      const existingObjects = await client.listObjectsRecursive(bucket.id);
      if (existingObjects.length > 0) {
        await client.deleteObjects(
          bucket.id,
          existingObjects.map((object) => object.key),
        );
      }
    }
  }

  let uploadedObjectCount = 0;
  for (const object of preparedObjects) {
    await client.uploadObject(object.bucket, object.key, object.bytes);
    uploadedObjectCount += 1;
  }

  let downloadedObjectCount = 0;
  let verifiedTotalBytes = 0;
  let hashMismatchCount = 0;
  let sizeMismatchCount = 0;
  for (const object of manifest.objects) {
    const bytes = await client.downloadObject(object.bucket, object.key);
    downloadedObjectCount += 1;
    verifiedTotalBytes += bytes.byteLength;
    if (bytes.byteLength !== object.sizeBytes) sizeMismatchCount += 1;
    if (sha256Hex(bytes) !== object.sha256) hashMismatchCount += 1;
  }

  const expectedIdentities = new Set(
    manifest.objects.map((object) =>
      storageIdentity(object.bucket, object.key),
    ),
  );
  const actualIdentities = new Set();
  let metadataObjectCount = 0;
  for (const bucket of manifest.buckets) {
    const objects = await client.listObjectsRecursive(bucket.id);
    for (const object of objects) {
      actualIdentities.add(storageIdentity(bucket.id, object.key));
      metadataObjectCount += 1;
    }
  }

  const missingObjectCount = [...expectedIdentities].filter(
    (identity) => !actualIdentities.has(identity),
  ).length;
  const extraObjectCount = [...actualIdentities].filter(
    (identity) => !expectedIdentities.has(identity),
  ).length;

  const result = evaluateStorageRestoreResult({
    expectedObjectCount: manifest.objectCount,
    expectedTotalBytes: manifest.totalBytes,
    uploadedObjectCount,
    downloadedObjectCount,
    verifiedTotalBytes,
    hashMismatchCount,
    sizeMismatchCount,
    missingObjectCount,
    extraObjectCount,
    metadataObjectCount,
    businessObjectCount: manifest.businessObjectCount,
  });

  const output = {
    ...result,
    environment: 'Disposable',
    productionTarget: false,
    storageApiOnly: true,
    directStorageSqlUsed: false,
    protectDeleteDisabled: false,
    cleanupExistingRequested: cleanupExisting,
    secretFreeOutput: true,
  };
  log(JSON.stringify(output, null, 2));
  if (!result.complete) {
    throw new Error(`Local Storage restore failed (${result.findings.length})`);
  }
  return output;
}

export function validateLocalStorageUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Storage restore URL must be a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Storage restore URL must use HTTP or HTTPS');
  }
  if (!loopbackHosts.has(url.hostname)) {
    throw new Error(
      'Disposable local Storage restore URL must be loopback-only',
    );
  }
  url.pathname = url.pathname.replace(/\/$/u, '');
  return url;
}

export function resolveWithinRoot(root, candidate) {
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    throw new Error('Storage source relative path is required');
  }
  if (isAbsolute(candidate) || containsTraversal(candidate)) {
    throw new Error('Storage source path must stay inside source root');
  }
  const rootPath = resolve(root);
  const resolvedPath = resolve(rootPath, normalize(candidate));
  const relativePath = relative(rootPath, resolvedPath);
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error('Storage source path escaped source root');
  }
  return resolvedPath;
}

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function createStorageApiClient({ baseUrl, serviceRoleKey, fetchImpl }) {
  const storageBase = new URL('/storage/v1/', baseUrl);
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  async function request(path, options = {}) {
    const response = await fetchImpl(new URL(path, storageBase), {
      ...options,
      headers: {
        ...headers,
        ...(options.headers ?? {}),
      },
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

    async createBucket(bucket) {
      const body = {
        id: bucket.id,
        name: bucket.id,
        public: bucket.public === true,
      };
      if (Number.isInteger(bucket.fileSizeLimit)) {
        body.file_size_limit = bucket.fileSizeLimit;
      }
      if (Array.isArray(bucket.allowedMimeTypes)) {
        body.allowed_mime_types = bucket.allowedMimeTypes;
      }
      await request('bucket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },

    async uploadObject(bucket, key, bytes) {
      await request(`object/${encodePath(bucket)}/${encodePath(key)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-upsert': 'true',
        },
        body: bytes,
      });
    },

    async downloadObject(bucket, key) {
      const response = await request(
        `object/${encodePath(bucket)}/${encodePath(key)}`,
      );
      return Buffer.from(await response.arrayBuffer());
    },

    async deleteObjects(bucket, keys) {
      if (keys.length === 0) return;
      await request(`object/${encodePath(bucket)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: keys }),
      });
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
  };
}

function encodePath(value) {
  return String(value)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function storageIdentity(bucket, key) {
  return `${bucket}\u0000${key}`;
}

function containsTraversal(value) {
  return String(value)
    .replaceAll('\\', '/')
    .split('/')
    .some((segment) => segment === '..');
}

function normalizeSha256(value) {
  if (typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^sha256:/u, '');
  return /^[a-f0-9]{64}$/u.test(normalized) ? normalized : null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

function firstNonNegativeInteger(...values) {
  for (const value of values) {
    if (Number.isInteger(value) && value >= 0) return value;
  }
  return null;
}

function failedManifest(rule) {
  return {
    status: 'STORAGE_RESTORE_MANIFEST_FAILED',
    complete: false,
    findings: [rule],
    buckets: [],
    objects: [],
    objectCount: 0,
    totalBytes: 0,
    businessObjectCount: 0,
  };
}

function parseCliArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    if (name === 'cleanup-existing') {
      values[name] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) continue;
    values[name] = value;
    index += 1;
  }
  return values;
}

if (isMainModule(import.meta.url)) {
  const args = parseCliArgs(process.argv.slice(2));
  runLocalStorageRestore({
    manifestPath: args.manifest,
    sourceRoot: args['source-root'],
    environment: args.environment ?? 'Disposable',
    cleanupExisting: args['cleanup-existing'] === true,
  }).catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Local Storage restore failed',
    );
    process.exitCode = 1;
  });
}
