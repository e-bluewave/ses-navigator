# BA-013 Monitoring / Alert Evidence Template

Use this template only for Staging or disposable validation. The monitoring provider may remain undecided; evidence must describe observable behavior, not vendor-specific credentials or endpoints.

Never record credentials, Supabase Project Refs, URLs, email addresses, personal data, query parameter values, Production identifiers, or alert payloads containing sensitive values.

## Validation scope

Confirm that all signals required by `ops/monitoring-policy.json` are observable:

- application errors
- slow SQL
- database connection usage
- database capacity
- database lock waits
- RLS load
- job backlog / oldest job age

Confirm alert behavior:

- critical notification delivered
- warning notification delivered
- duplicate notifications suppressed/deduplicated
- recovery notification delivered
- alert owner/routing verified
- test alert completed before Production
- measured Staging baseline captured
- initial thresholds reviewed against the measured baseline
- monitoring runbook linked
- quarterly review scheduled

## Secret-free evidence JSON

```json
{
  "evidenceId": "BA013-MONITORING-YYYYMMDD-01",
  "environment": "Staging",
  "completedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "allRequiredSignalsObserved": true,
  "criticalAlertDelivered": true,
  "warningAlertDelivered": true,
  "deduplicationVerified": true,
  "recoveryNotificationVerified": true,
  "ownerRoutingVerified": true,
  "testAlertCompleted": true,
  "measuredBaselineCaptured": true,
  "thresholdReviewCompleted": true,
  "runbookLinked": true,
  "quarterlyReviewScheduled": true,
  "secretsInAlerts": false,
  "personalDataInAlerts": false,
  "queryParameterValuesInAlerts": false,
  "productionIdentifiersRecorded": false,
  "secretFreeEvidence": true,
  "followUpRequired": false,
  "notes": "Provider-neutral, Secret-free summary only."
}
```

Validate a temporary local evidence file with:

```bash
node scripts/check-monitoring-evidence.mjs path/to/secret-free-evidence.json
```

Expected result:

```text
MONITORING_EVIDENCE_PASSED
```

BA-013 remains pending until a real Staging/disposable alert drill and baseline measurement are performed. A passing unit test or this template alone is not operational evidence.
