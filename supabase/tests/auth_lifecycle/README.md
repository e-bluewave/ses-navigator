# BA-003 Auth lifecycle drill

## Purpose

Run the RB-008 account lifecycle drill in a dedicated non-Production environment without putting credentials, JWTs, email addresses, MFA secrets, Project Refs, or personal data in GitHub, PRs, chat, or logs.

The drill proves four boundaries:

1. baseline access works for a dedicated test user;
2. suspension revokes business access and an existing session is rejected;
3. administrator permission removal blocks administrator access;
4. reactivation restores only the intended least-privilege access.

## Safety rules

- Never run this drill against Production.
- Use a dedicated disposable non-Production user.
- Keep all credentials and tokens only in the local process environment.
- Never paste `SESN_TEST_ACCESS_TOKEN`, password, email address, JWT, MFA secret, or Project Ref into an Issue, PR, chat, terminal transcript, or evidence file.
- Do not delete an Auth user as the normal suspend/reactivate mechanism.
- Disable business access before revoking sessions.
- Evidence records contain only non-identifying operation IDs and PASS/FAIL results.

## Probe modes

The probe is intentionally limited to authentication and a single business API read. It never prints a token or response body.

### Fresh login + allowed API

Set the required environment variables locally and run:

```powershell
$env:SESN_AUTH_LIFECYCLE_PROBE_MODE = "login"
$env:SESN_EXPECT_LOGIN = "allow"
$env:SESN_EXPECT_API = "allow"
pnpm smoke:auth-lifecycle
```

Expected result: fresh authentication succeeds and `/api/v1/projects?limit=1` succeeds.

### Existing session must be rejected after suspension/session revoke

Keep the pre-suspension access token only in a local environment variable. After business access is disabled and Supabase Auth sessions are revoked:

```powershell
$env:SESN_AUTH_LIFECYCLE_PROBE_MODE = "access-token"
$env:SESN_EXPECT_API = "deny"
pnpm smoke:auth-lifecycle
```

Expected result: the business API returns HTTP 401 or 403.

### Fresh login must be denied when the chosen suspension mechanism blocks Auth login

If the operational suspension configuration is intended to block fresh authentication itself:

```powershell
$env:SESN_AUTH_LIFECYCLE_PROBE_MODE = "login"
$env:SESN_EXPECT_LOGIN = "deny"
$env:SESN_EXPECT_API = "skip"
pnpm smoke:auth-lifecycle
```

If the chosen design allows Auth login but blocks all business access through the application profile/membership boundary, use `SESN_EXPECT_LOGIN=allow` and `SESN_EXPECT_API=deny` instead.

## Drill sequence

### A. Baseline

1. Confirm the target environment is not Production.
2. Confirm a dedicated test user is being used.
3. Confirm intended tenant, organization, role, and permissions.
4. Run the fresh-login/allowed-API probe.
5. For an administrator test user, confirm AAL2 is required for administrative access.

### B. Suspend

1. Disable SES Navigator business access first.
2. Remove or expire administrative privileges before session revocation.
3. Preserve the old access token only in local process memory/environment for the rejection check.
4. Revoke the target user's Supabase Auth sessions.
5. Run the existing-session denial probe and require HTTP 401/403.
6. Verify fresh login/business access follows the selected operational suspension design.
7. Confirm audit/operation evidence exists without identifying values.

### C. Administrator revoke

1. Remove administrator role/permissions in the application database.
2. Confirm `/api/v1/auth/context` reflects loss of administrator requirements.
3. Confirm administrative UI/API/RPC operations are rejected.
4. Revoke sessions if needed so stale client state cannot be trusted.

### D. Reactivate

1. Confirm the suspension reason is resolved.
2. Restore only the intended membership/role/permissions.
3. Use a new session; never restore an old revoked token.
4. Run the fresh-login/allowed-API probe.
5. Confirm unrelated or elevated permissions remain denied.

## Secret-free evidence template

Store only non-identifying evidence, for example:

```text
Operation ID: BA003-DRILL-YYYYMMDD-NN
Environment class: non-production
Baseline login/API: PASS/FAIL
Business access disabled before session revoke: yes/no
Sessions revoked: yes/no
Old session rejected with 401/403: yes/no
Fresh login/business boundary checked: yes/no
Admin permission revoked: yes/no/not-applicable
Admin operation rejected: yes/no/not-applicable
Reactivation with new session: PASS/FAIL
Least-privilege boundary rechecked: yes/no
Audit evidence confirmed: yes/no
Overall: PASS/FAIL
```

Do not add the user's email address, Auth UUID, token, password, Project Ref, or MFA secret to the evidence.

## Repository checks

```powershell
pnpm smoke:auth-lifecycle:check
pnpm smoke:auth-project:check
pnpm security:data-api:all:check
pnpm security:client-secrets
```

BA-003 remains `pending` until the real non-Production drill described by RB-008 is completed and secret-free evidence confirms all required boundaries.
