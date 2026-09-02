# BA-003 Auth lifecycle real-environment validation

Date: 2026-09-02
Environment class: non-production
Scope: RB-008 / BA-003 account lifecycle drill

## Result

Overall: PASS

A dedicated non-Production test user was used. No email address, password, JWT, access token, refresh token, MFA secret, Project Ref, environment URL, Auth UUID, or Production data is recorded in this evidence.

## Verified boundaries

| Check | Result |
| --- | --- |
| Baseline existing-session business API access | PASS (HTTP 200) |
| Business access disabled before session revoke | PASS |
| Old access token rejected after suspension | PASS (HTTP 403) |
| Global session sign-out | PASS (HTTP 204) |
| Old refresh token rejected after sign-out | PASS (HTTP 400) |
| Suspension model fresh login / business boundary | PASS (fresh authentication allowed, business API HTTP 403) |
| Reactivation with new session | PASS (login allowed, business API HTTP 200) |
| Administrator context after privilege revoke | PASS (`requiresMfa=false`) |
| Administrator metadata access after privilege revoke | PASS (hidden by authorization boundary) |
| Final project API access | PASS (HTTP 200) |
| Final `project.read` permission | PASS |
| Final `user.manage` permission | PASS (absent) |
| Final `role.manage` permission | PASS (absent) |
| Least-privilege access restored | PASS |

## Drill sequence

1. Confirmed the dedicated Staging user could use the authorized Projects API before suspension.
2. Suspended the SES Navigator application profile and tenant membership in the non-Production environment.
3. Reused the pre-suspension access token and confirmed the business API returned HTTP 403.
4. Revoked the Auth session with global sign-out and confirmed HTTP 204.
5. Confirmed the pre-revoke refresh token could not be reused and returned HTTP 400.
6. Reactivated the user and confirmed a new login and Projects API access succeeded.
7. Provisioned a temporary administrator-drill permission boundary, revoked it, and confirmed the existing session no longer required the administrator MFA context and could no longer see administrator metadata.
8. Repeated suspension and confirmed the selected operational model: authentication may succeed while SES Navigator business access remains denied with HTTP 403.
9. Restored the dedicated user to active least-privilege operation and confirmed `project.read=true`, `user.manage=false`, and `role.manage=false`.

## Completion judgment

BA-003 completion conditions are satisfied for the implemented non-Production lifecycle model:

- suspension blocks business access without deleting the Auth user;
- old sessions are rejected at the business authorization boundary;
- global session revoke invalidates the refresh-token chain;
- administrator permission loss is reflected without trusting stale client state;
- reactivation uses a new session and restores only intended least-privilege access;
- the retained evidence is secret-free and non-identifying.

Production execution was not performed.
