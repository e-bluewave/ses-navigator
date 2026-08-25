# BA-015 Initial Data Migration Evidence Template

Use this template only after the actual source system, mapping, and deduplication rules have been reviewed. The repository must not store the source files, credentials, personal data, Production identifiers, or source-system secrets.

## Validation scope

Use Staging or a disposable environment and synthetic/sanitized evidence. Confirm:

- source-to-target mapping reviewed
- deduplication rules reviewed per data type
- stable source identifiers used where available
- name-only automatic merge is not used
- ambiguous matches follow manual review
- dry-run completed before actual migration
- run ID recorded and migration execution completed
- rerun is idempotent; unexpected creates are zero
- created/updated/skipped/rejected counts are verified
- input checksum is verified
- referential integrity passes
- tenant-boundary violations are zero
- partial failures remain visible
- rollback is run-scoped and tested with a rollback dry-run
- rollback does not use full-table delete
- migration has no irreversible external side effects
- updated rows can be restored
- manual Production bulk editing is not used

## Secret-free evidence JSON

```json
{
  "evidenceId": "BA015-MIGRATION-YYYYMMDD-01",
  "environment": "Staging",
  "completedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "sourceMappingReviewed": true,
  "deduplicationRulesReviewed": true,
  "stableSourceIdsUsedWhereAvailable": true,
  "nameOnlyAutomaticMergeUsed": false,
  "ambiguousMatchesManuallyReviewed": true,
  "dryRunCompleted": true,
  "executionCompleted": true,
  "runIdRecorded": true,
  "idempotentRerunVerified": true,
  "rerunUnexpectedCreateCount": 0,
  "partialFailuresVisible": true,
  "inputChecksumVerified": true,
  "countsVerified": true,
  "referentialIntegrityPassed": true,
  "tenantBoundaryViolationCount": 0,
  "runScopedRollbackVerified": true,
  "rollbackDryRunCompleted": true,
  "fullTableDeleteUsed": false,
  "irreversibleSideEffectsUsed": false,
  "updatedRowRecoveryVerified": true,
  "productionManualBulkEditUsed": false,
  "productionIdentifiersRecorded": false,
  "personalDataRecorded": false,
  "secretOrPersonalDataExposed": false,
  "secretFreeEvidence": true,
  "followUpRequired": false,
  "notes": "Source-neutral, Secret-free summary only."
}
```

Validate a temporary local evidence file with:

```bash
node scripts/check-data-migration-evidence.mjs path/to/secret-free-evidence.json
```

Expected result:

```text
DATA_MIGRATION_EVIDENCE_PASSED
```

BA-015 remains pending until the real source/mapping/deduplication rules are confirmed and an actual Staging migration dry-run, execution, rerun, and rollback drill are completed.
