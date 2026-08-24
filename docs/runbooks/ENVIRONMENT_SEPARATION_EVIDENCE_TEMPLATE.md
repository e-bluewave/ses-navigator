# Environment Separation Evidence Template

This template is used to complete BA-001 after Staging and Production have actually been created as separate environments.

Store completed evidence in an access-controlled operational location. Do not record environment identifiers, Project Refs, Supabase URLs, Vercel Project IDs, Secret values, JWTs, email addresses, or Production data in this repository, PRs, chat, or logs.

## JSON template

```json
{
  "evidenceId": "BA001-ENV-YYYYMMDD-NN",
  "verifiedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "stagingSupabaseDistinct": true,
  "productionSupabaseDistinct": true,
  "stagingVercelDistinct": true,
  "productionVercelDistinct": true,
  "stagingAndProductionSupabaseDifferent": true,
  "stagingAndProductionVercelDifferent": true,
  "secretsSeparated": true,
  "productionDataUsedOutsideProduction": false,
  "runtimeBindingCheck": "PASS",
  "stagingCommitMatchesMain": true,
  "stagingSmokeTest": "PASS",
  "secretFreeEvidence": true,
  "migrationParity": "PASS",
  "notes": "Environment identifiers are stored outside the repository."
}
```

## Runtime binding check

Provide the real identifiers only as local environment variables and do not persist them:

```powershell
$env:SESN_STAGING_SUPABASE_URL = "<staging value>"
$env:SESN_PRODUCTION_SUPABASE_URL = "<production value>"
$env:SESN_STAGING_VERCEL_PROJECT_ID = "<staging value>"
$env:SESN_PRODUCTION_VERCEL_PROJECT_ID = "<production value>"
pnpm security:env-separation
```

Expected status:

```text
ENVIRONMENT_SEPARATION_PASSED
```

## Evidence validation

Save the completed evidence JSON outside the repository and run:

```powershell
pnpm security:env-separation-evidence -- "C:\path\outside-repository\ba001-environment-evidence.json"
```

Expected status:

```text
ENVIRONMENT_SEPARATION_EVIDENCE_PASSED
```

BA-001 remains pending until the real Staging/Production projects exist, bindings are confirmed distinct, Staging is running the intended `Main` commit, and the Staging smoke test passes.
