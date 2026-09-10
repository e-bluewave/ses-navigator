# Storage Backup Capture Automation

## Purpose

`security:storage-backup-capture` automates the machine-verifiable capture portion of a fresh BA-007 Storage backup set and links it to the fresh BA-006 database capture that defines the paired recovery point.

A capture PASS does **not** claim that offsite publication, immutable retention, encryption-at-rest, retention lock, or final BA-007 Evidence approval is complete. Those remain governed by RB-012 and the existing BA-007 evidence validator.

## What the command automates

The runner:

1. requires an explicit `Staging` or `Production` environment;
2. accepts the Storage source URL and service-role key only from process environment variables;
3. requires the private `database-backup-capture.private.json` produced by the matching fresh BA-006 capture;
4. verifies that DB and Storage environments match and that the DB capture recorded Storage exclusions plus migration/Application schema baselines;
5. rejects output paths inside the Git repository;
6. records Storage `startedAt` before inventory collection;
7. lists every Storage bucket and object recursively through the Storage API;
8. requires at least one retained object so the later BA-008 transfer/read path can be exercised;
9. downloads every object and records exact size plus SHA-256;
10. stores snapshot bytes under deterministic hash-derived local paths so arbitrary Storage object keys cannot escape the snapshot root or collide with Windows-invalid path characters;
11. preserves the original bucket and object key separately in the restore manifest;
12. re-lists the complete source inventory after capture and requires exact identity parity;
13. downloads every captured object a second time and requires identical size/SHA-256, detecting content changes during capture;
14. computes DB/Storage recovery-point skew from the BA-006 `startedAt` and BA-007 `startedAt`;
15. writes a restore-ready `storage-restore-manifest.private.json` plus `storage-backup-capture.private.json`, both UTF-8 without BOM;
16. emits only counts, booleans, measured skew, environment, and generic status to stdout.

The Storage URL, service-role key, bucket/object names, object bytes, private paths, DB backup run ID, and user/business data are not printed in the success summary.

## Runtime variables

Set only in the local process environment:

- `SESN_STORAGE_BACKUP_URL`
- `SESN_STORAGE_BACKUP_SERVICE_ROLE_KEY`

Remote sources must use HTTPS. Loopback HTTP is allowed for local validation/tests only.

## Windows PowerShell

Use one atomic block so a failed stage cannot be followed by an unrelated false PASS line.

```powershell
& {
  $ErrorActionPreference = 'Stop'

  $Repo = 'D:\Dropbox\ebw\■受託案件\SESN\ses-navigator'
  $DbManifest = 'C:\SESN-ops-evidence\ba006\<fresh-run>\database-backup-capture.private.json'
  $Output = 'C:\SESN-ops-evidence\ba007\<fresh-run>'

  Set-Location $Repo

  foreach ($name in @('SESN_STORAGE_BACKUP_URL', 'SESN_STORAGE_BACKUP_SERVICE_ROLE_KEY')) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
      throw "$name is not set in the current process"
    }
  }

  pnpm security:storage-backup-capture -- `
    --environment Staging `
    --repo-root $Repo `
    --database-manifest $DbManifest `
    --output-dir $Output

  if ($LASTEXITCODE -ne 0) { throw 'Storage backup capture failed' }
}
```

Expected final status:

```text
STORAGE_BACKUP_CAPTURE_PASSED
```

## Output

The output directory contains:

```text
snapshot/
storage-restore-manifest.private.json
storage-backup-capture.private.json
```

`storage-restore-manifest.private.json` is directly consumable by the BA-008 local Storage restore runner after the snapshot has been materialized from the approved offsite destination.

All captured objects are marked `businessObject: false` by this capture runner. This is intentional: the runner can prove transport and integrity but cannot safely infer from a bucket/key whether an object is real business data, a retained validation fixture, or another operational object. A later governed classification step may make a business-file claim; the capture runner never invents one.

## Empty Storage

BA-008 requires a representative Storage read. Therefore this capture runner fails closed when the source inventory contains zero retained objects.

For an otherwise empty Staging Storage environment, create one governed retained validation object through the normal Storage API before running BA-007. Do not insert `storage.objects` or `storage.buckets` rows directly with SQL.

The validation object should remain clearly non-business and may be reused by subsequent restore drills. Production should not be mutated merely to satisfy a drill without separate operational approval.

## Snapshot consistency boundary

Supabase Storage does not provide this runner with a cross-object transactional snapshot. To avoid silently accepting a moving source, the runner performs two independent safeguards:

- exact initial-vs-final bucket/object identity comparison;
- second-read size/SHA-256 comparison for every captured object.

Any inventory or content change causes the capture to fail. Retry with a fresh output directory.

## Completion boundary

A local capture PASS means:

- all current Storage objects were read through the API;
- exact snapshot bytes and integrity metadata were produced;
- the source remained stable across the verification window;
- the paired BA-006 recovery point was linked and skew measured;
- the output is ready for the governed offsite publication step.

BA-007 is complete only after RB-012 offsite destination, generation protection, retention, encryption/TLS, and final BA-007 Evidence requirements are truthfully satisfied and the existing validator passes.
