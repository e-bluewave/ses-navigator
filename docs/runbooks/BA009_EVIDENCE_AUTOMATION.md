# BA-009 RPO/RTO Evidence Automation

`security:rpo-rto-from-restore` builds BA-009 evidence directly from a validated BA-008 restore-drill evidence file.

## What is automated

- re-validates the BA-008 restore evidence before using it;
- copies the measured RPO/RTO values without shortening or adjusting them;
- applies the same platform-wide measured RPO/RTO to Tier 1, Tier 2 and Tier 3 evidence fields;
- reads owner approvals only as booleans from a private governance facts file;
- never places owner names in the public BA-009 evidence JSON;
- validates the generated BA-009 evidence against the current RPO/RTO policy;
- writes UTF-8 without BOM;
- reports `BA009_EVIDENCE_READY` only when approvals and all policy targets pass;
- reports `BA009_EVIDENCE_BLOCKED` and exits non-zero when any target is exceeded.

An approved exception does not convert an RPO/RTO target miss into PASS. The current validator intentionally continues to block the evidence when measured values exceed policy targets.

## Private governance facts

Start from `docs/runbooks/BA009_GOVERNANCE_FACTS_TEMPLATE.json` and keep the completed copy outside Git.

Do not add names, email addresses, credentials, Project Ref, Supabase URLs, backup run IDs, or restored data to the governance facts or public evidence.

Required approvals:

- `businessOwnerApproved: true`
- `technicalOwnerApproved: true`
- `targetsAcknowledged: true`
- `annualReviewScheduled: true`
- `exceptionUsed: true|false`

If an exception is used, both `exceptionApprovalPresent` and `exceptionExpiryPresent` must be true.

## PowerShell execution

Use one atomic block:

```powershell
& {
  $ErrorActionPreference = 'Stop'

  $Repo = 'D:\Dropbox\ebw\■受託案件\SESN\ses-navigator'
  Set-Location $Repo

  pnpm security:rpo-rto-from-restore -- `
    --restore 'C:\SESN-ops-evidence\<run>\restore-drill-evidence.private.json' `
    --governance 'C:\SESN-ops-evidence\<run>\ba009-governance.private.json' `
    --output 'C:\SESN-ops-evidence\<run>\ba009-rpo-rto-evidence.private.json'

  if ($LASTEXITCODE -ne 0) { throw 'BA-009 evidence is not release-ready' }
}
```

Success output contains `BA009_EVIDENCE_READY`.

When targets are missed, the evidence file is still written with the real measured values for audit/follow-up, but the command exits non-zero with `BA009_EVIDENCE_BLOCKED` semantics. Do not edit the measured values to make the validator pass.
