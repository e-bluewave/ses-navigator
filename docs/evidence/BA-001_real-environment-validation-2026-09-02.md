# BA-001 Real-Environment Validation Evidence

## Validation date

2026-09-02

## Scope

Staging and Production environment separation was validated against RB-009 without recording environment identifiers or secrets in the repository.

## Result

```text
environment_separation=PASS
runtime_binding_check=PASS
staging_main_commit_match=PASS
staging_auth_project_smoke=PASS
staging_data_api_runtime_boundary=PASS (8/8)
production_read_only_health_smoke=PASS
migration_parity=PASS (001-159)
external_evidence_validator=ENVIRONMENT_SEPARATION_EVIDENCE_PASSED
```

## Verified controls

- Staging and Production use separate Supabase projects.
- Staging and Production use separate Vercel projects.
- Production secrets are scoped to Production and are not shared with Staging/Preview.
- Environment-specific bindings were supplied only at runtime and the separation check passed with runtime bindings enabled.
- Staging was running the same `Main` commit that was validated for promotion.
- Staging Supabase Auth login succeeded for a dedicated synthetic test user.
- The authenticated Projects API smoke returned HTTP 200; an empty `items` result was accepted by the documented smoke criteria.
- The Staging test user used a least-privilege role containing `project.read` for the smoke test.
- Data API runtime boundary regression passed all 8 checks and reported `mutatesData=false` with a zero-row write probe.
- Anonymous Data API reads/RPCs were denied, authenticated reviewed surfaces were allowed, unreviewed/service surfaces were denied, and the audit schema was not exposed.
- Production `/health` returned `status=ok` using a read-only smoke request.
- Staging and Production migration histories were confirmed aligned through Migration 159.
- External secret-free evidence `BA001-ENV-20260902-01` passed the repository evidence validator with `complete=true` and no findings.

## Evidence handling

The completed operational evidence JSON is stored outside the repository in an access-controlled location. This report intentionally contains no Secret, JWT, API key, Supabase Project Ref, Supabase/Vercel environment URL, Vercel Project ID, DB password, email address, test-user UUID, personal information, or Production data.

## Related assets

- `docs/runbooks/RB-009_環境分離・昇格.md`
- `docs/runbooks/ENVIRONMENT_SEPARATION_EVIDENCE_TEMPLATE.md`
- `scripts/check-environment-separation.mjs`
- `scripts/check-environment-separation-evidence.mjs`
- `scripts/auth-project-smoke.mjs`
- `scripts/data-api-runtime-boundary-regression.mjs`
- `ops/p0-release-readiness.json`
- `docs/runbooks/RB-023_P0リリース準備判定.md`
