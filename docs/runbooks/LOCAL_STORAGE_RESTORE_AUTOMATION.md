# Local Storage Restore Automation

## Purpose

`security:restore-local-storage` automates the Storage portion of a BA-008 restore drill for a Disposable Local Supabase target.

It intentionally does **not** restore the `storage` PostgreSQL schema or write directly to `storage.buckets` / `storage.objects`. Bucket and object metadata are recreated by the Storage API.

## Safety boundary

The runner fails closed unless all of the following are true:

- `--environment Disposable` is used (the default).
- the target Storage URL is loopback-only (`localhost`, `127.0.0.1`, or `::1`).
- a restore-only local service-role key is supplied through the process environment.
- the manifest is strict JSON without a UTF-8 BOM.
- each snapshot object exists under the supplied source root.
- source size and SHA-256 match the manifest before any upload.

The runner never prints the target URL, service-role key, bucket/object names, object content, or response bodies.

## Required local environment

Set the restore-only values in the local shell. Do not commit them and do not paste them into GitHub, PRs, chat, or public evidence.

```powershell
$env:SESN_RESTORE_STORAGE_URL = '<local Supabase URL>'
$env:SESN_RESTORE_STORAGE_SERVICE_ROLE_KEY = '<local restore-only service role key>'
```

These variables are consumed only at runtime.

## Restore inventory manifest

The private manifest must contain at least one retained object so the transfer and integrity path is actually exercised. If BA-007 has zero business files, keep a validation object and set `businessObject` to `false`.

Example shape:

```json
{
  "buckets": [
    {
      "id": "validation-bucket",
      "public": false
    }
  ],
  "objects": [
    {
      "bucket": "validation-bucket",
      "key": "validation/object.bin",
      "sizeBytes": 123,
      "sha256": "<64 hex characters>",
      "businessObject": false
    }
  ]
}
```

Accepted compatibility aliases include:

- bucket: `bucket`, `bucketId`, `bucket_id`
- object key: `key`, `objectKey`, `object_key`, `name`
- size: `sizeBytes`, `size_bytes`, `size`, `bytes`
- checksum: `sha256`, `checksumSha256`, `checksum_sha256`, `checksum`
- optional local relative source path: `sourcePath`, `source_path`, `localPath`, `local_path`

Absolute paths and `..` traversal are rejected. If `sourcePath` is omitted, the file is resolved as `<source-root>/<bucket>/<key>`.

The source root is a local materialization of the selected immutable BA-007 snapshot. Materializing the offsite snapshot remains an operator-side action until a repository-standard R2/S3 download mechanism is selected; credentials must stay outside the repository.

## Command

```powershell
& {
  $ErrorActionPreference = 'Stop'

  pnpm security:restore-local-storage -- `
    --manifest 'C:\private-evidence\storage-restore-manifest.json' `
    --source-root 'C:\private-evidence\storage-snapshot' `
    --environment Disposable

  if ($LASTEXITCODE -ne 0) { throw 'Local Storage restore failed' }
}
```

Expected final status:

```text
LOCAL_STORAGE_RESTORE_PASSED
```

## Existing / ghost metadata cleanup

On a disposable target only, `--cleanup-existing` removes existing objects from only the manifest buckets through the Storage API before upload.

```powershell
pnpm security:restore-local-storage -- `
  --manifest '<private manifest path>' `
  --source-root '<private snapshot root>' `
  --environment Disposable `
  --cleanup-existing
```

The runner does not:

- run SQL against `storage.buckets` or `storage.objects`;
- disable `storage.protect_delete`;
- delete buckets outside the selected manifest;
- operate on a non-loopback Storage URL.

## Verification performed

After upload, the runner:

1. downloads every expected object through the Storage API;
2. verifies exact byte length;
3. verifies SHA-256;
4. recursively lists objects through the Storage API;
5. requires zero missing objects;
6. requires zero extra objects;
7. requires metadata object count to equal the manifest object count;
8. reports whether any verified object was classified as a business object.

If BA-007 contains only a retained validation object, `businessFileRestoreClaimed` remains `false` even when the restore passes.

## Public evidence rule

Public evidence may record only booleans, counts, PASS/FAIL states, and timing. Do not publish bucket names, object keys, target URLs, backup run IDs, service keys, or restored content.
