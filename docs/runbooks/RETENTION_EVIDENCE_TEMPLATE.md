# BA-010 Data Retention / Disposal Evidence Template

Use this template only for Staging or disposable validation. Do not record credentials, Supabase Project Refs, URLs, email addresses, personal data, Production identifiers, row payloads, or backup contents.

## Validation scope

Confirm all current categories in `ops/retention-policy.json` have been exercised with synthetic or non-sensitive test data where applicable.

Required checks:

- retention trigger calculation matches policy
- expired records are deleted or irreversibly anonymized as defined by policy
- active Legal Hold prevents deletion
- releasing Legal Hold resumes the normal disposition path
- backup restore does not permanently reintroduce already disposed data
- deletion/tombstone process is reapplied after restore
- no Production identifier or personal data is copied into the evidence record

## Secret-free evidence JSON

```json
{
  "evidenceId": "BA010-RETENTION-YYYYMMDD-01",
  "environment": "Staging",
  "completedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "policyCategoriesValidated": true,
  "expiredDataDeletedOrIrreversiblyAnonymized": true,
  "legalHoldPreventsDeletion": true,
  "legalHoldReleaseResumesDisposition": true,
  "retentionTriggersValidated": true,
  "backupRestoreReappliesDeletion": true,
  "deletedDataReintroducedAfterRestore": false,
  "productionIdentifiersRecorded": false,
  "personalDataRecorded": false,
  "secretOrPersonalDataExposed": false,
  "secretFreeEvidence": true,
  "followUpRequired": false,
  "notes": "Secret-free summary only."
}
```

Validate outside the repository or against a temporary local file:

```bash
pnpm security:retention-evidence -- path/to/secret-free-evidence.json
```

Expected result:

```text
RETENTION_EVIDENCE_PASSED
```

BA-010 must remain pending until real Staging/disposable validation is performed. The presence of this template or a passing unit test is not operational evidence.
