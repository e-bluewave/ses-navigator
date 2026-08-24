# Secret Rotation Drill Evidence Template

This template is for BA-005/RB-007 non-Production rotation drills.

The completed evidence file must be stored in an access-controlled operational location outside the repository. Do not commit a real drill evidence file when it contains environment-identifying metadata that should remain private.

## Rules

- Production must not be used for the initial drill.
- Never record a Secret value or fragment.
- Never record JWTs, access/refresh tokens, passwords, email addresses, MFA secrets, Project Refs, direct credential URLs, or response bodies.
- `secretId` is an operational identifier only; it must not contain the credential value.
- `oldCredentialRejected` is normally `yes`. Use `not-testable` only when the provider gives no safe way to test an already revoked credential, and record a non-sensitive reason.

## JSON template

```json
{
  "drillId": "BA005-DRILL-YYYYMMDD-NN",
  "secretId": "staging-secret-operational-id",
  "environment": "Staging",
  "provider": "provider-name",
  "startedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "completedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "inventoryValidation": "PASS",
  "newCredentialDeployed": true,
  "smokeTest": "PASS",
  "oldCredentialRevoked": true,
  "oldCredentialRejected": "yes",
  "newCredentialVerified": true,
  "productionTouched": false,
  "secretFreeEvidence": true,
  "rollbackUsed": false,
  "monitoringResult": "PASS",
  "notes": "No secret values recorded."
}
```

If rejection is not safely testable:

```json
{
  "oldCredentialRejected": "not-testable",
  "oldCredentialRejectionReason": "Provider limitation described without credential values."
}
```

## Validation

Save the completed JSON outside the repository and run:

```powershell
pnpm security:secret-rotation-evidence -- "C:\path\outside-repository\ba005-drill-evidence.json"
```

Successful output contains:

```text
SECRET_ROTATION_DRILL_EVIDENCE_PASSED
```

Also validate the external inventory:

```powershell
pnpm security:secret-inventory -- "C:\path\outside-repository\secret-inventory.json"
```

Successful output contains:

```text
SECRET_INVENTORY_PASSED
```

BA-005 remains pending until the actual non-Production rotation drill is completed, the old credential is revoked, the new credential is verified, and the secret-free evidence passes this checker.
