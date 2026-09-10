# Local Restore Drill Automation

## Purpose

`security:restore-local-run` is the top-level Disposable Local BA-008 runner.

It combines the previously separate restore and validation steps into one fail-closed sequence:

1. validate private run facts;
2. validate all required runtime variables before any restore begins;
3. require loopback-only Supabase and Storage URLs on the same origin;
4. run DB target/preflight checks, transactional DB restore, exact app/audit table-set parity, and deletion-tombstone parity;
5. run Storage API restore and full object integrity/inventory verification;
6. ensure dependencies are ready without changing tracked files;
7. build and start the local API on a dynamically selected loopback port;
8. run Auth + representative application smoke;
9. run the full Data API security suite, including Tenant A/Tenant B isolation checks;
10. capture the business-usable timestamp immediately after live validation passes;
11. calculate conservative joint RPO from the older DB/Storage recovery point;
12. calculate RTO from drill start to business usability (evidence writing/cleanup time is excluded);
13. evaluate Tier 1/2/3 RPO/RTO targets;
14. assemble BA-008 evidence, run the existing evidence validator, then write UTF-8 without BOM.

## What remains operator-controlled

The runner deliberately does not manufacture governance or backup facts. Before the run, the operator must have already established:

- fresh BA-006 DB backup artifacts;
- fresh BA-007 Storage snapshot/materialization;
- DB and Storage recovery-point timestamps;
- backup linkage is valid;
- DB/Storage recovery-point alignment is acceptable;
- a follow-up reference exists when Tier 1 or Tier 2 targets are expected to miss.

These facts belong in a private run-facts JSON created from `LOCAL_RESTORE_DRILL_RUN_FACTS_TEMPLATE.json`. Migration parity and deletion-tombstone parity are not operator assertions: they are measured automatically from the BA-006 schema/data artifacts against the restored DB.

## Runtime secrets

Secrets never belong in run-facts JSON, Git, PRs, chat, or public evidence. Set them only in the local process environment.

Required variable names:

- `SESN_RESTORE_STORAGE_URL`
- `SESN_RESTORE_STORAGE_SERVICE_ROLE_KEY`
- `SESN_SUPABASE_URL`
- `SESN_SUPABASE_PUBLISHABLE_KEY`
- `SESN_SUPABASE_SECRET_KEY`
- `SESN_TEST_EMAIL`
- `SESN_TEST_PASSWORD`
- `SESN_TEST_USER_A_EMAIL`
- `SESN_TEST_USER_A_PASSWORD`
- `SESN_TEST_USER_B_EMAIL`
- `SESN_TEST_USER_B_PASSWORD`

The top-level runtime preflight runs **before** DB restore. `SESN_SUPABASE_URL` and `SESN_RESTORE_STORAGE_URL` must both be loopback URLs and must have the same origin. The local API process is forced to use these SESN local Supabase values even if unrelated `SUPABASE_URL` / `SUPABASE_ANON_KEY` variables already exist in the shell.

## One-command PowerShell execution

Use an `& { ... }` block so any thrown error terminates the whole pasted block and a later line cannot print a false PASS.

```powershell
& {
  $ErrorActionPreference = 'Stop'

  $Repo = 'D:\Dropbox\ebw\■受託案件\SESN\ses-navigator'
  Set-Location $Repo

  pnpm security:restore-local-run -- `
    --facts 'C:\SESN-ops-evidence\<run>\restore-run-facts.private.json' `
    --output 'C:\SESN-ops-evidence\<run>\restore-drill-evidence.private.json'

  if ($LASTEXITCODE -ne 0) { throw 'Local restore drill failed' }
}
```

Expected final status:

```text
LOCAL_RESTORE_DRILL_PASSED
```

The final stdout is intentionally limited to secret-free status, measured RPO/RTO, tier PASS/FAIL results, follow-up requirement, and whether a business-file restore was actually claimed.

## RPO/RTO policy mapping

The runner evaluates the current RB-014 targets:

| Tier | RPO target | RTO target |
| --- | ---: | ---: |
| Tier 1 | 60 minutes | 240 minutes |
| Tier 2 | 240 minutes | 480 minutes |
| Tier 3 | 1440 minutes | 1440 minutes |

If any Tier 1 or Tier 2 target is missed, `followUpRequired` is automatically `true`. A private run-facts file must then assert `followUpReferencePresent: true`; otherwise evidence assembly fails closed.

This does **not** turn a BA-009 target miss into PASS. BA-009 continues to use the measured values and its own policy validator.

## Evidence semantics

- `rolesRestore=PASS` is emitted only for the currently supported empty custom-role set. Supabase-managed roles remain target-native; the raw `roles.sql` is not falsely claimed as replayed.
- `databaseStorageConsistency=PASS` is emitted only after DB restore, Storage API restore, same-origin local runtime safety, Auth/Application smoke, Data API security regression, and tenant isolation all pass.
- `rlsTenantIsolation=PASS` is based on the Data API limited-view checks that require User A to see Tenant A only and User B to see zero Tenant A rows.
- `representativeFileRead=PASS` comes from Storage API readback with SHA-256 and byte-size verification.
- `businessFileRestoreClaimed` remains false when BA-007 contains only retained validation objects.

## Failure behavior

The runner does not continue to later stages after a failed stage. It does not print SQL bodies, object content, credentials, URLs, user emails, bucket/object names, backup run IDs, or private file paths in its success summary.

Do not delete the Disposable restore environment until the private evidence file has passed validation and any required BA-009 measurements have been captured.
