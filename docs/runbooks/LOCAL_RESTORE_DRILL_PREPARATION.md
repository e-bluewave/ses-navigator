# Local Restore Drill Preparation

`security:restore-local-prepare` prepares the private input consumed by `security:restore-local-run`.

The purpose is to remove manual copying of recovery-point timestamps and linkage assertions from BA-006/BA-007 evidence.

## Automated checks

The preparer:

1. validates the preparation input structure;
2. re-validates the selected BA-006 database backup evidence;
3. re-validates the selected BA-007 Storage backup evidence;
4. requires the DB and Storage backup environments to match;
5. derives `databaseRecoveryPointAt` from BA-006 `startedAt`;
6. derives `storageRecoveryPointAt` from BA-007 `startedAt`;
7. recalculates the DB/Storage recovery-point skew;
8. requires the recalculated skew to match the BA-007 evidence within a small rounding tolerance;
9. requires the BA-007 DB linkage, DB/Storage recovery-point recording, and joint recovery-point flags to be valid;
10. writes the private `restore-run-facts` JSON as UTF-8 without BOM.

The output deliberately does not copy backup evidence IDs, credentials, URLs, or restored data.

## What still must be supplied locally

Start from `LOCAL_RESTORE_DRILL_PREPARATION_TEMPLATE.json` and fill only the private local operational values:

- repository path;
- paths to the current BA-006 and BA-007 evidence files;
- paths to DB preflight facts and BA-006 `roles.sql` / `schema.sql` / `data.sql`;
- Disposable Local Supabase DB container name and the restore-only name token;
- BA-007 restore manifest and materialized snapshot root;
- whether existing local Storage objects may be cleaned through the Storage API;
- whether a follow-up reference already exists.

Do not place Secrets, database URLs, Supabase URLs, credentials, test accounts, backup run IDs, or restored data in this JSON.

## PowerShell

Use one atomic block:

```powershell
& {
  $ErrorActionPreference = 'Stop'

  $Repo = 'D:\Dropbox\ebw\■受託案件\SESN\ses-navigator'
  Set-Location $Repo

  pnpm security:restore-local-prepare -- `
    --input 'C:\SESN-ops-evidence\<run>\restore-preparation.private.json' `
    --output 'C:\SESN-ops-evidence\<run>\restore-run-facts.private.json'

  if ($LASTEXITCODE -ne 0) { throw 'Restore run-facts preparation failed' }
}
```

Success status:

```text
RESTORE_RUN_FACTS_PREPARED
```

After success, run `security:restore-local-run` with the generated `restore-run-facts.private.json`.

## RPO note

The preparer never substitutes backup `completedAt` for the recovery point. BA-006 `startedAt` and BA-007 `startedAt` are used because the runbooks define those as the conservative recovery points. This prevents RPO from being understated by using later evidence-completion times.
