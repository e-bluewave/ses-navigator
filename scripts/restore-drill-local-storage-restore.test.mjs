import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  evaluateStorageRestoreResult,
  normalizeRestoreStorageManifest,
  resolveWithinRoot,
  runLocalStorageRestore,
  sha256Hex,
  validateLocalStorageUrl,
} from './restore-drill-local-storage-restore.mjs';

test('normalizes BA-007 style restore inventory variants', () => {
  const sha = 'a'.repeat(64);
  const result = normalizeRestoreStorageManifest({
    buckets: [{ id: 'validation', public: false }],
    objects: [
      {
        bucket_id: 'validation',
        object_key: 'proof/item.bin',
        size_bytes: 12,
        checksum: `sha256:${sha}`,
        business_object: false,
      },
    ],
  });

  assert.equal(result.complete, true);
  assert.equal(result.objectCount, 1);
  assert.equal(result.totalBytes, 12);
  assert.equal(result.businessObjectCount, 0);
  assert.equal(result.objects[0].sha256, sha);
});

test('rejects duplicate identities and unsafe source paths', () => {
  const sha = 'b'.repeat(64);
  const result = normalizeRestoreStorageManifest({
    objects: [
      {
        bucket: 'files',
        key: 'same.bin',
        size: 1,
        sha256: sha,
        sourcePath: '../escape.bin',
      },
      { bucket: 'files', key: 'same.bin', size: 1, sha256: sha },
    ],
  });

  assert.equal(result.complete, false);
  assert.ok(
    result.findings.includes('object-0-source-path-traversal-not-allowed'),
  );
  assert.ok(result.findings.includes('object-1-duplicate-bucket-key'));
});

test('requires at least one retained object so transfer path is exercised', () => {
  const result = normalizeRestoreStorageManifest({ objects: [] });
  assert.equal(result.complete, false);
  assert.ok(result.findings.includes('at-least-one-restore-object-required'));
});

test('local Storage target safety gate rejects remote hosts', () => {
  assert.throws(
    () => validateLocalStorageUrl('https://example.com'),
    /loopback-only/u,
  );
  assert.equal(
    validateLocalStorageUrl('http://127.0.0.1:54321').hostname,
    '127.0.0.1',
  );
});

test('source path resolver prevents traversal outside snapshot root', () => {
  assert.throws(
    () => resolveWithinRoot('/safe/root', '../escape'),
    /inside source root/u,
  );
  assert.match(resolveWithinRoot('/safe/root', 'bucket/file.bin'), /bucket/u);
});

test('storage restore result passes only on exact count bytes hash and inventory parity', () => {
  const pass = evaluateStorageRestoreResult({
    expectedObjectCount: 1,
    expectedTotalBytes: 4,
    uploadedObjectCount: 1,
    downloadedObjectCount: 1,
    verifiedTotalBytes: 4,
    hashMismatchCount: 0,
    sizeMismatchCount: 0,
    missingObjectCount: 0,
    extraObjectCount: 0,
    metadataObjectCount: 1,
    businessObjectCount: 0,
  });
  assert.equal(pass.complete, true);
  assert.equal(pass.businessFileRestoreClaimed, false);
  assert.equal(pass.storageIntegrityVerification, 'PASS');

  const fail = evaluateStorageRestoreResult({
    expectedObjectCount: 1,
    expectedTotalBytes: 4,
    uploadedObjectCount: 1,
    downloadedObjectCount: 1,
    verifiedTotalBytes: 4,
    hashMismatchCount: 0,
    sizeMismatchCount: 0,
    missingObjectCount: 0,
    extraObjectCount: 1,
    metadataObjectCount: 2,
    businessObjectCount: 0,
  });
  assert.equal(fail.complete, false);
  assert.ok(fail.findings.includes('storage-object-extra'));
});

test('full local Storage restore uses API only and verifies nested object readback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sesn-storage-restore-'));
  try {
    const sourceRoot = join(root, 'snapshot');
    const sourcePath = join(sourceRoot, 'validation', 'proof', 'item.bin');
    await mkdir(join(sourceRoot, 'validation', 'proof'), { recursive: true });
    const bytes = Buffer.from('BA008-storage-validation');
    await writeFile(sourcePath, bytes);

    const manifestPath = join(root, 'manifest.json');
    await writeFile(
      manifestPath,
      JSON.stringify({
        buckets: [{ id: 'validation', public: false }],
        objects: [
          {
            bucket: 'validation',
            key: 'proof/item.bin',
            sizeBytes: bytes.byteLength,
            sha256: sha256Hex(bytes),
            businessObject: false,
          },
        ],
      }),
    );

    const api = createMockStorageApi();
    const output = await runLocalStorageRestore({
      manifestPath,
      sourceRoot,
      targetUrl: 'http://127.0.0.1:54321',
      serviceRoleKey: 'local-test-only',
      fetchImpl: api.fetch,
      log: () => {},
    });

    assert.equal(output.complete, true);
    assert.equal(output.storageApiOnly, true);
    assert.equal(output.directStorageSqlUsed, false);
    assert.equal(output.expectedObjectCount, 1);
    assert.equal(output.metadataRegeneratedCount, 1);
    assert.equal(output.businessFileRestoreClaimed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cleanup-existing removes extras through Storage API before restore', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sesn-storage-cleanup-'));
  try {
    const sourceRoot = join(root, 'snapshot');
    await mkdir(join(sourceRoot, 'validation'), { recursive: true });
    const bytes = Buffer.from('replacement');
    await writeFile(join(sourceRoot, 'validation', 'item.bin'), bytes);
    const manifestPath = join(root, 'manifest.json');
    await writeFile(
      manifestPath,
      JSON.stringify({
        objects: [
          {
            bucket: 'validation',
            key: 'item.bin',
            size: bytes.byteLength,
            sha256: sha256Hex(bytes),
          },
        ],
      }),
    );

    const api = createMockStorageApi({
      validation: new Map([['ghost.bin', Buffer.from('ghost')]]),
    });
    const output = await runLocalStorageRestore({
      manifestPath,
      sourceRoot,
      targetUrl: 'http://localhost:54321',
      serviceRoleKey: 'local-test-only',
      cleanupExisting: true,
      fetchImpl: api.fetch,
      log: () => {},
    });

    assert.equal(output.complete, true);
    assert.equal(output.cleanupExistingRequested, true);
    assert.equal(api.objects.get('validation').has('ghost.bin'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function createMockStorageApi(seed = {}) {
  const buckets = new Set(Object.keys(seed));
  const objects = new Map(
    Object.entries(seed).map(([bucket, entries]) => [bucket, new Map(entries)]),
  );

  async function fetch(urlValue, options = {}) {
    const url = new URL(urlValue);
    const path = decodeURIComponent(
      url.pathname.replace(/^\/storage\/v1\//u, ''),
    );
    const method = options.method ?? 'GET';

    if (path === 'bucket' && method === 'GET') {
      return jsonResponse([...buckets].map((id) => ({ id })));
    }
    if (path === 'bucket' && method === 'POST') {
      const body = JSON.parse(options.body);
      buckets.add(body.id);
      if (!objects.has(body.id)) objects.set(body.id, new Map());
      return jsonResponse({ name: body.id });
    }

    const listMatch = /^object\/list\/([^/]+)$/u.exec(path);
    if (listMatch && method === 'POST') {
      const bucket = listMatch[1];
      const body = JSON.parse(options.body);
      const prefix = body.prefix ?? '';
      const entries = listImmediate(objects.get(bucket) ?? new Map(), prefix);
      return jsonResponse(entries.slice(body.offset, body.offset + body.limit));
    }

    const objectMatch = /^object\/([^/]+)\/(.+)$/u.exec(path);
    if (objectMatch) {
      const [, bucket, key] = objectMatch;
      if (!objects.has(bucket)) objects.set(bucket, new Map());
      if (method === 'POST') {
        objects.get(bucket).set(key, Buffer.from(options.body));
        return jsonResponse({ Key: key });
      }
      if (method === 'GET') {
        const value = objects.get(bucket).get(key);
        if (!value) return new Response('', { status: 404 });
        return new Response(value, { status: 200 });
      }
    }

    const deleteMatch = /^object\/([^/]+)$/u.exec(path);
    if (deleteMatch && method === 'DELETE') {
      const body = JSON.parse(options.body);
      const bucketObjects = objects.get(deleteMatch[1]) ?? new Map();
      for (const key of body.prefixes) bucketObjects.delete(key);
      return jsonResponse([]);
    }

    return new Response('', { status: 404 });
  }

  return { fetch, objects };
}

function listImmediate(bucketObjects, prefix) {
  const files = [];
  const folders = new Set();
  const prefixWithSlash = prefix ? `${prefix}/` : '';
  for (const key of bucketObjects.keys()) {
    if (!key.startsWith(prefixWithSlash)) continue;
    const remainder = key.slice(prefixWithSlash.length);
    const slashIndex = remainder.indexOf('/');
    if (slashIndex >= 0) {
      folders.add(remainder.slice(0, slashIndex));
    } else {
      files.push({ id: `id-${key}`, name: remainder });
    }
  }
  return [...[...folders].map((name) => ({ id: null, name })), ...files];
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
