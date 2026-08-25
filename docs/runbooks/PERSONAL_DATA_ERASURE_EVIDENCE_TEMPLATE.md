# BA-011 Personal Data Erasure Evidence Template

Use this template only for Staging or disposable validation with synthetic/non-sensitive test data. Never record credentials, Supabase Project Refs, URLs, email addresses, personal data, row payloads, object contents, or Production identifiers.

## Validation scope

Confirm the BA-011 policy behavior end to end:

- dry-run inventory exists before destructive action
- database records are hard-deleted or irreversibly anonymized
- Storage objects are deleted where required
- search/index/derived data is removed
- masking, pseudonymization, or soft-delete alone is not accepted as erasure
- no re-identification key remains after irreversible anonymization
- active Legal Hold prevents deletion and access stays restricted
- tenant offboarding revokes access and blocks new writes
- integration credentials, webhooks, and tokens are revoked
- backup tombstone ledger is updated
- restored backups reapply deletion so erased data does not return
- evidence remains Secret-free and personal-data-free

## Secret-free evidence JSON

```json
{
  "evidenceId": "BA011-ERASURE-YYYYMMDD-01",
  "environment": "Staging",
  "completedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "dryRunInventoryCompleted": true,
  "databaseDeletionCompleted": true,
  "storageDeletionCompleted": true,
  "derivedDataDeletionCompleted": true,
  "irreversibleAnonymizationVerified": true,
  "reidentificationKeyPresent": false,
  "legalHoldRespected": true,
  "tenantOffboardingAccessRevoked": true,
  "newWritesBlocked": true,
  "integrationCredentialsRevoked": true,
  "webhooksAndTokensRevoked": true,
  "backupTombstoneLedgerUpdated": true,
  "restoreReapplyDeletionVerified": true,
  "productionIdentifiersRecorded": false,
  "personalDataRecorded": false,
  "secretOrPersonalDataExposed": false,
  "secretFreeEvidence": true,
  "dispositionMode": "hard-delete",
  "followUpRequired": false,
  "notes": "Secret-free summary only."
}
```

Validate against a temporary local file:

```bash
node scripts/check-personal-data-erasure-evidence.mjs path/to/secret-free-evidence.json
```

Expected result:

```text
PERSONAL_DATA_ERASURE_EVIDENCE_PASSED
```

BA-011 remains pending until a real Staging/disposable drill is performed. A passing unit test or this template alone is not operational evidence.
