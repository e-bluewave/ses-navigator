import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  evaluateStorageSnapshotStability,
  runStorageBackupCapture,
  validateDatabaseCaptureManifestForStorage,
  validateSourceStorageUrl,
  validateStorageBackupCaptureRequest,
} from './capture-storage-backup.mjs';

function databaseManifest(overrides = {}) {
  return {
    version: 1,
    backupRunId: 'BA006-DB-CAPTURE-TEST',
    environment: 'Staging',
    startedAt: '2026-09-10T00:00:00.000Z',
    secretFreeManifest: true,
    requiredStorageDataExclusionsApplied: true,
    migrationBaseline: { method: 'repository-migration-set-sha256' },
    applicationSchemaBaseline: { method: 'app-audit-table-set-sha256' },
    ...overrides,
  };
}

test('source URL requires HTTPS except loopback test/local sources', () => {
  assert.equal(
    validateSourceStorageUrl('https://example.com').protocol,
    'https:',
  );
  assert.equal(
    validateSourceStorageUrl('http://127.0.0.1:54321').hostname,
    '127.0.0.1',
  );
  assert.throws(
    () => validateSourceStorageUrl('http://example.com'),
    /must use HTTPS/u,
  );
});

test('capture request requires runtime Storage credentials and output outside repository', () => {
  const missing = validateStorageBackupCaptureRequest({
    environment: 'Staging',
    repoRoot: '/repo',
    outputDir: '/backup',
    databaseManifestPath: '/private/db.json',
    sourceUrl: '',
    serviceRoleKey: '',
  });
  assert.equal(missing.complete, false);
  assert.ok(missing.findings.includes('storage-url-runtime-secret-required'));
  assert.ok(
    missing.findings.includes(
      'storage-service-role-key-runtime-secret-required',
    ),
  );

  const inside = validateStorageBackupCaptureRequest({
    environment: 'Staging',
    repoRoot: '/repo',
    outputDir: '/repo/backup',
    databaseManifestPath: '/private/db.json',
    sourceUrl: 'https://example.com',
    serviceRoleKey: 'runtime-only',
  });
  assert.equal(inside.complete, false);
  assert.ok(
    inside.findings.includes(
      'storage-backup-output-must-be-outside-repository',
    ),
  );
});

test('database capture manifest must match environment and carry recovery baselines', () => {
  const valid = validateDatabaseCaptureManifestForStorage(
    databaseManifest(),
    'Staging',
  );
  assert.equal(valid.complete, true);
  assert.equal(valid.databaseRecoveryPointAt, '2026-09-10T00:00:00.000Z');

  const invalid = validateDatabaseCaptureManifestForStorage(
    databaseManifest({
      environment: 'Production',
      requiredStorageDataExclusionsApplied: false,
    }),
    'Staging',
  );
  assert.equal(invalid.complete, false);
  assert.ok(
    invalid.findings.includes('database-and-storage-environments-must-match'),
  );
  assert.ok(
    invalid.findings.includes('database-storage-data-exclusions-required'),
  );
});

test('snapshot stability rejects empty source, inventory drift, and content drift', () => {
  const empty = evaluateStorageSnapshotStability({
    initialIdentities: [],
    finalIdentities: [],
    contentMismatchCount: 0,
  });
  assert.equal(empty.complete, false);
  assert.ok(
    empty.findings.includes('at-least-one-retained-storage-object-required'),
  );

  const drift = evaluateStorageSnapshotStability({
    initialIdentities: ['files\u0000a.txt'],
    finalIdentities: ['files\u0000b.txt'],
    contentMismatchCount: 1,
  });
  assert.equal(drift.complete, false);
  assert.equal(drift.missingIdentityCount, 1);
  assert.equal(drift.extraIdentityCount, 1);
  assert.ok(
    drift.findings.includes('storage-object-content-changed-during-capture'),
  );
});

test('full capture writes snapshot plus restore/capture manifests without secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sesn-storage-capture-'));
  const repoRoot = join(root, 'repo');
  const outputDir = join(root, 'storage-backup');
  const databaseManifestPath = join(root, 'database-capture.json');
  await mkdir(repoRoot, { recursive: true });
  await writeFile(databaseManifestPath, JSON.stringify(databaseManifest()));

  const api = createMockStorageSource({
    files: new Map([
      ['alpha.txt', Buffer.from('alpha')],
      ['nested/bravo.bin', Buffer.from('bravo')],
    ]),
  });
  const logs = [];
  const times = [
    new Date('2026-09-10T00:10:00.000Z'),
    new Date('2026-09-10T00:11:00.000Z'),
  ];

  try {
    const result = await runStorageBackupCapture({
      environment: 'Staging',
      repoRoot,
      outputDir,
      databaseManifestPath,
      sourceUrl: 'http://127.0.0.1:54321',
      serviceRoleKey: 'runtime-storage-secret',
      fetchImpl: api.fetch,
      now: () => times.shift(),
      log: (value) => logs.push(String(value)),
    });

    assert.equal(result.complete, true);
    assert.equal(result.sourceObjectCount, 2);
    assert.equal(result.recoveryPointSkewMinutesMeasured, 10);
    assert.equal(result.businessFileBackupClaimed, false);
    assert.equal(result.captureManifest.databaseBackupRunLinked, true);
    assert.equal(result.captureManifest.jointRecoveryPointEstablished, true);
    assert.equal(result.restoreManifest.objects.length, 2);
    assert.equal(
      result.restoreManifest.objects.every(
        (object) => object.businessObject === false,
      ),
      true,
    );

    const alphaEntry = result.restoreManifest.objects.find(
      (object) => object.bucket === 'files' && object.key === 'alpha.txt',
    );
    assert.ok(alphaEntry);
    const alpha = await readFile(
      join(outputDir, 'snapshot', ...alphaEntry.sourcePath.split('/')),
    );
    assert.equal(alpha.toString(), 'alpha');
    assert.match(alphaEntry.sourcePath, /^objects\/[a-f0-9]{64}\.bin$/u);
    const manifestText = await readFile(
      join(outputDir, 'storage-backup-capture.private.json'),
      'utf8',
    );
    const restoreText = await readFile(
      join(outputDir, 'storage-restore-manifest.private.json'),
      'utf8',
    );
    assert.equal(manifestText.charCodeAt(0) === 0xfeff, false);
    assert.equal(restoreText.charCodeAt(0) === 0xfeff, false);
    assert.equal(manifestText.includes('runtime-storage-secret'), false);
    assert.equal(restoreText.includes('runtime-storage-secret'), false);
    assert.equal(logs.join('\n').includes('runtime-storage-secret'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('capture fails closed when object content changes between verification reads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sesn-storage-content-drift-'));
  const repoRoot = join(root, 'repo');
  const outputDir = join(root, 'storage-backup');
  const databaseManifestPath = join(root, 'database-capture.json');
  await mkdir(repoRoot, { recursive: true });
  await writeFile(databaseManifestPath, JSON.stringify(databaseManifest()));
  const api = createMockStorageSource(
    { files: new Map([['item.bin', Buffer.from('first')]]) },
    { mutateOnSecondDownload: true },
  );

  try {
    await assert.rejects(
      runStorageBackupCapture({
        environment: 'Staging',
        repoRoot,
        outputDir,
        databaseManifestPath,
        sourceUrl: 'http://localhost:54321',
        serviceRoleKey: 'runtime-only',
        fetchImpl: api.fetch,
        log: () => {},
      }),
      /changed during capture/u,
    );
    await assert.rejects(
      readFile(join(outputDir, 'storage-backup-capture.private.json')),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('capture fails closed when source inventory is empty', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sesn-storage-empty-'));
  const repoRoot = join(root, 'repo');
  const outputDir = join(root, 'storage-backup');
  const databaseManifestPath = join(root, 'database-capture.json');
  await mkdir(repoRoot, { recursive: true });
  await writeFile(databaseManifestPath, JSON.stringify(databaseManifest()));
  const api = createMockStorageSource({ validation: new Map() });

  try {
    await assert.rejects(
      runStorageBackupCapture({
        environment: 'Staging',
        repoRoot,
        outputDir,
        databaseManifestPath,
        sourceUrl: 'http://localhost:54321',
        serviceRoleKey: 'runtime-only',
        fetchImpl: api.fetch,
        log: () => {},
      }),
      /no retained object/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function createMockStorageSource(seed, options = {}) {
  const buckets = new Map(
    Object.entries(seed).map(([id, objects]) => [
      id,
      {
        id,
        public: false,
        file_size_limit: null,
        allowed_mime_types: null,
        objects: new Map(objects),
      },
    ]),
  );
  const downloadCounts = new Map();

  async function fetch(urlValue, request = {}) {
    const url = new URL(urlValue);
    const path = decodeURIComponent(
      url.pathname.replace(/^\/storage\/v1\//u, ''),
    );
    const method = request.method ?? 'GET';

    if (path === 'bucket' && method === 'GET') {
      return jsonResponse(
        [...buckets.values()].map((bucket) => ({
          id: bucket.id,
          public: bucket.public,
          file_size_limit: bucket.file_size_limit,
          allowed_mime_types: bucket.allowed_mime_types,
        })),
      );
    }

    if (path.startsWith('object/list/') && method === 'POST') {
      const bucketId = path.slice('object/list/'.length);
      const bucket = buckets.get(bucketId);
      if (!bucket) return jsonResponse({ message: 'missing' }, 404);
      const body = JSON.parse(request.body ?? '{}');
      const prefix = typeof body.prefix === 'string' ? body.prefix : '';
      const entries = listPrefix(bucket.objects, prefix);
      return jsonResponse(entries);
    }

    if (path.startsWith('object/') && method === 'GET') {
      const rest = path.slice('object/'.length);
      const slash = rest.indexOf('/');
      const bucketId = rest.slice(0, slash);
      const key = rest.slice(slash + 1);
      const bucket = buckets.get(bucketId);
      if (!bucket || !bucket.objects.has(key)) {
        return jsonResponse({ message: 'missing' }, 404);
      }
      const identity = `${bucketId}\u0000${key}`;
      const count = (downloadCounts.get(identity) ?? 0) + 1;
      downloadCounts.set(identity, count);
      let bytes = bucket.objects.get(key);
      if (options.mutateOnSecondDownload === true && count >= 2) {
        bytes = Buffer.from(`${bytes.toString()}-changed`);
      }
      return binaryResponse(bytes);
    }

    return jsonResponse({ message: 'unsupported' }, 400);
  }

  return { fetch, buckets };
}

function listPrefix(objects, prefix) {
  const directFiles = new Map();
  const folders = new Set();
  const prefixWithSlash = prefix ? `${prefix}/` : '';
  for (const key of objects.keys()) {
    if (!key.startsWith(prefixWithSlash)) continue;
    const remainder = key.slice(prefixWithSlash.length);
    if (remainder === '') continue;
    const slash = remainder.indexOf('/');
    if (slash < 0) {
      directFiles.set(remainder, { name: remainder, id: `id-${remainder}` });
    } else {
      folders.add(remainder.slice(0, slash));
    }
  }
  return [
    ...[...folders].sort().map((name) => ({ name, id: null })),
    ...[...directFiles.values()].sort((a, b) => a.name.localeCompare(b.name)),
  ];
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function binaryResponse(bytes) {
  return new Response(bytes, { status: 200 });
}
