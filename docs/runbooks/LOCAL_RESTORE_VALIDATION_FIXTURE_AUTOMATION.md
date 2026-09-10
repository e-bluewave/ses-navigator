# Local Restore Validation Fixture Automation

## Purpose

`security:restore-local-run-fixture` is the Disposable Local BA-008 wrapper for a fresh backup that does not already contain the deterministic Data API validation fixture.

The underlying DB restore, Storage restore, Auth/Application validation, RPO/RTO measurement, target evaluation, and BA-008 evidence assembly remain owned by `restore-drill-local-run.mjs`. This wrapper only adds the validation fixture lifecycle required by the existing Data API/RLS security suite.

## Sequence

The wrapper performs the following sequence:

1. read the private restore run facts and require the configured DB container name to contain its restore-only name token;
2. read the tracked `02_setup.sql` and `05_cleanup.sql` validation assets and reject UTF-8 BOM input;
3. optionally run `supabase status --workdir <path> -o env` and use only its local `API_URL`, `ANON_KEY`, and `SERVICE_ROLE_KEY` values in memory;
4. generate two unique synthetic Auth users and one strong random password in memory;
5. call the existing measured restore runner;
6. after DB and Storage restore, create the two local Auth users through the local Auth Admin API;
7. replace only the two email placeholders in `02_setup.sql`, run the setup transaction, and require `READY_FOR_VALIDATION`;
8. run the existing Auth/Application/Data API/RLS live validation;
9. let the underlying runner capture business usability, RPO/RTO, and validated BA-008 evidence;
10. run the existing cleanup transaction and require `CLEANUP_PASSED`;
11. remove the generated Auth users;
12. emit the normal secret-free restore summary only after fixture cleanup succeeds.

Fixture setup occurs inside the measured restore window because the validation environment is not business-usable until the security checks can run. Fixture cleanup runs only after the underlying restore runner has captured business usability, so cleanup time is excluded from RTO.

## Local runtime discovery

When `--supabase-workdir` is provided, no local Supabase key values need to be copied into the shell. The wrapper calls the native CLI and maps the local values internally:

- `API_URL` -> `SESN_SUPABASE_URL` and `SESN_RESTORE_STORAGE_URL`;
- `ANON_KEY` -> `SESN_SUPABASE_PUBLISHABLE_KEY`;
- `SERVICE_ROLE_KEY` -> `SESN_SUPABASE_SECRET_KEY` and `SESN_RESTORE_STORAGE_SERVICE_ROLE_KEY`.

On Windows the wrapper selects `supabase.exe`; on other platforms it selects `supabase`.

The underlying runner still performs its normal loopback-only and same-origin runtime preflight before any restore mutation.

## Command

```powershell
& {
  $ErrorActionPreference = 'Stop'

  $Repo = 'D:\Dropbox\ebw\■受託案件\SESN\ses-navigator'
  Set-Location $Repo

  pnpm.cmd security:restore-local-run-fixture -- `
    --facts 'C:\SESN-ops-evidence\<run>\restore-run-facts.private.json' `
    --output 'C:\SESN-ops-evidence\<run>\restore-drill-evidence.private.json' `
    --supabase-workdir 'C:\SESN-ops-evidence\restore-runtime\<run>'

  if ($LASTEXITCODE -ne 0) {
    throw 'Local restore drill with validation fixture failed'
  }
}
```

Expected final status:

```text
LOCAL_RESTORE_DRILL_PASSED
```

The summary also includes:

```text
validationFixtureLifecycle: PASS
```

## Failure behavior

- If either validation SQL placeholder changed unexpectedly, the run fails before DB restore.
- If generated Auth user creation fails, any already-created generated Auth user is removed.
- `02_setup.sql` is transactional; a missing `READY_FOR_VALIDATION` marker fails closed before live validation.
- If live validation fails, the wrapper attempts the deterministic cleanup while preserving the original validation failure.
- If `05_cleanup.sql` fails after the fixture was committed, generated Auth users are intentionally preserved with the fixture for investigation instead of partially deleting the validation identity graph.
- The wrapper suppresses the underlying success summary and prints final PASS only after deterministic cleanup succeeds, preventing a cleanup failure from being followed by a false wrapper PASS.

The wrapper never prints generated emails, passwords, Supabase URLs, local keys, SQL bodies, private paths, restored business data, or backup run IDs in its success output.

## Governance boundary

This automation does not manufacture or replace formal BA-006 or BA-007 governance Evidence. Fresh capture manifests can support the technical restore drill, but offsite publication, retention, encryption, generation protection, and any other governance assertions remain separate evidence requirements.
