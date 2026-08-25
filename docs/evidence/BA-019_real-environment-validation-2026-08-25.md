# BA-019 Real-Environment Validation Evidence

## Validation date

2026-08-25

## Scope

Migration 159 (`supabase/migrations/159_sensitive_source_surface_hardening.sql`) was applied to the target non-Production environment and the BA-019 postcheck was executed.

## Result

```text
status=BA019_POSTCHECK_PASSED
migration=159
raw_sensitive_surface=closed
project_source_summary=verified
```

## Verified controls

- `public.project_source_summaries` exists.
- `security_barrier=true`.
- `security_invoker=true`.
- `anon` cannot SELECT the summary surface.
- `authenticated` can SELECT the approved summary surface.
- `service_role` cannot SELECT the summary surface.
- `authenticated` cannot perform a full SELECT against `app.project_sources`; only the approved columns are exposed.
- Raw sensitive tables are not directly readable by `anon` or `authenticated`.
- `audit.audit_logs` does not permit full-table SELECT through the exposed surface.
- `raw_sensitive_surface=closed`.
- `project_source_summary=verified`.

## Evidence handling

This report intentionally contains no Secret, JWT, API key, Supabase Project Ref, DB URL, password, email address, personal information, or Production identifier.

## Related assets

- `supabase/migrations/159_sensitive_source_surface_hardening.sql`
- `supabase/tests/ba019/01_precheck.sql`
- `supabase/tests/ba019/02_postcheck.sql`
- `supabase/tests/ba019/README.md`
- `scripts/check-sensitive-data-api-surface.mjs`
- `scripts/check-sensitive-data-api-surface.test.mjs`
- `ops/p0-release-readiness.json`
- `docs/runbooks/RB-023_P0リリース準備判定.md`
