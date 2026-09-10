# Database Backup Capture Automation

## Purpose

`security:db-backup-capture` automates the machine-verifiable part of a fresh BA-006 database backup set before offsite publication and final BA-006 evidence approval.

It intentionally does **not** claim that offsite retention, encryption, or destination governance has been completed. Those controls remain separately validated by RB-011 / BA-006 evidence. A capture PASS means the local backup set is internally valid and ready for the governed offsite publication step; it does not mean BA-006 is complete by itself.

## What the command automates

The runner:

1. requires an explicit `Staging` or `Production` environment;
2. accepts the database URL only from the `SESN_DB_URL` process environment variable;
3. rejects backup output paths inside the Git repository;
4. records `startedAt` immediately before the first dump as the conservative DB recovery point;
5. captures `roles.sql`, `schema.sql`, and `data.sql` with Supabase CLI;
6. forces `data.sql` to use COPY mode and explicitly excludes:
   - `storage.buckets`
   - `storage.objects`
   - `storage.buckets_vectors`
   - `storage.vector_indexes`
7. requires all three artifacts to be non-empty strict UTF-8 without BOM;
8. rejects Storage-managed SQL contamination using the same restore-preflight inspection logic used by BA-008;
9. derives PostgreSQL major version from the schema dump header;
10. records the exact `app` / `audit` table-set semantic baseline as SHA-256;
11. records the repository migration set baseline as SHA-256 plus migration count;
12. records artifact sizes and SHA-256 checksums;
13. writes `database-backup-capture.private.json` using UTF-8 without BOM;
14. emits only counts, booleans, environment, and generic status to stdout.

The DB URL, SQL bodies, migration names, artifact paths, backup run ID, credentials, and restored/business data are not printed in the success output.

## Windows PowerShell

Use one atomic block so a failed command cannot be followed by an unrelated false PASS line.

```powershell
& {
  $ErrorActionPreference = 'Stop'

  $Repo = 'D:\Dropbox\ebw\■受託案件\SESN\ses-navigator'
  $Output = 'C:\SESN-ops-evidence\ba006\<fresh-run>'

  Set-Location $Repo

  # Set SESN_DB_URL only in the current process. Do not print it.
  if ([string]::IsNullOrWhiteSpace($env:SESN_DB_URL)) {
    throw 'SESN_DB_URL is not set in the current process'
  }

  pnpm security:db-backup-capture -- `
    --environment Staging `
    --repo-root $Repo `
    --output-dir $Output

  if ($LASTEXITCODE -ne 0) { throw 'Database backup capture failed' }
}
```

Expected final status:

```text
DATABASE_BACKUP_CAPTURE_PASSED
```

## Output

The output directory contains:

```text
roles.sql
schema.sql
data.sql
database-backup-capture.private.json
```

The private manifest is not a substitute for the final BA-006 evidence. It records machine-derived capture facts only.

Before BA-006 is considered fresh/complete, RB-011 still requires the artifact set to be copied to the approved offsite destination and the current BA-006 evidence validator to PASS with truthful retention, encryption, TLS, destination, and secret-exposure facts.

## Failure behavior

The runner fails closed when:

- the runtime DB URL is missing or malformed;
- the environment is not explicitly Staging/Production;
- output is inside the repository;
- a target output file already exists;
- any Supabase dump stage returns non-zero;
- an artifact is empty, contains a UTF-8 BOM, or is invalid UTF-8;
- the schema dump does not expose a PostgreSQL major version;
- the Application schema baseline is empty;
- Storage-managed SQL is detected;
- the repository migration baseline is missing.

If a dump stage fails after earlier artifacts were created, no PASS manifest is generated. Use a fresh output directory for the next run rather than mixing partial artifacts from different attempts.
