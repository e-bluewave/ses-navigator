# BA-002 Region / Connectivity Validation Evidence

## Validation date

2026-09-02

## Scope

Vercel Functions and Supabase database region alignment, runtime database mode, runtime binding, authenticated Staging API latency, and Production health execution region were validated without recording environment identifiers or secrets in the repository.

## Result

```text
region_alignment=PASS
staging_function_region=hnd1
production_function_region=hnd1
runtime_database_mode=data-api
runtime_binding_check=DATABASE_CONNECTIVITY_PASSED
runtime_bindings_checked=true
staging_api_samples=100
staging_api_success=100
staging_api_errors=0
staging_api_error_rate_percent=0
staging_api_latency_p50_ms=147.30
staging_api_latency_p95_ms=179.92
staging_api_latency_p99_ms=392.37
production_health_http_status=200
```

## Verified controls

- Staging and Production Supabase databases are assigned to the same Tokyo region class.
- Vercel Functions are explicitly pinned to Tokyo (`hnd1`) at the API project level.
- Staging Main deployment was observed running in `hnd1` after the region configuration change.
- Production `/health` returned HTTP 200 and the Function execution region was observed as `hnd1`.
- Runtime database mode is `data-api` for both Staging and Production; BA-002 introduces no Direct SQL runtime connection.
- `security:db-connectivity` passed with runtime bindings checked and no failures.
- The authenticated Staging Projects API was measured for 100 requests after warm-up; all 100 succeeded and the measured error rate was 0 percent.
- Recorded latency was P50 147.30 ms, P95 179.92 ms, and P99 392.37 ms.
- Transaction Pooler remains reserved for a future Direct SQL runtime requirement; it is not the current SES Navigator runtime path.
- Migration and backup/restore policy continues to prohibit Transaction Pooler for administrative operations, per RB-010.

## Evidence handling

This report contains no Secret, JWT, API key, Supabase Project Ref, Supabase/Vercel environment URL, Vercel Project ID, DB password, email address, test-user UUID, personal information, or Production data.

## Related assets

- `apps/api/vercel.json`
- `docs/runbooks/RB-010_リージョン・DB接続方式.md`
- `ops/database-connectivity-policy.json`
- `scripts/check-database-connectivity-policy.mjs`
- `ops/p0-release-readiness.json`
- `docs/runbooks/RB-023_P0リリース準備判定.md`
