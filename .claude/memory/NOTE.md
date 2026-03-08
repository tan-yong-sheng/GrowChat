# RBAC + D1 Debug Note (2026-03-08)

- Symptom seen by user: `POST /api/auth/login` returned `500` with `no such table: user_roles`.
- Important context: Wrangler local D1 is scoped to working directory (`.wrangler/state/v3/d1`), so one folder can be migrated while another is not.
- Root cause: auth role-binding wrote to `user_roles` before RBAC migration existed in the active DB target.
- Additional issue: `PRAGMA database_list` can throw `SQLITE_AUTH` in some D1 environments; avoid depending on it for schema checks.

## Stabilization Applied

- `src/routers/auth.js`
  - `ensureUserRoleBinding()` now catches missing RBAC tables and skips binding with warning instead of breaking login.
  - This prevents auth outages before migration is applied.
- `src/index.js`
  - RBAC diagnostics use `sqlite_master` table existence checks only.
  - Removed dependency on `PRAGMA database_list` to avoid `SQLITE_AUTH`.
  - Logs clear missing-table guidance: run `migrations/008_rbac_core.sql`.

## Behavioral Confirmation

- Playwright reproduction on local dev showed login request returns `401 Invalid credentials` (expected for unknown/incorrect user), not `500`.
- Wrangler logs confirmed: `RBAC schema ready. Required tables present.` in migrated local environment.

## Open WebUI Alignment Note

- First-user admin behavior is implemented with post-insert check in signup flow (insert user, then promote to admin if total users == 1), mirroring Open WebUI’s safer pattern.

