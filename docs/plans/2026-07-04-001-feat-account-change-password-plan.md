---
title: 'feat: Add Change Password to Account Settings'
created: 2026-07-04
status: active
depth: standard
origin: user-request
---

# feat: Add Change Password to Account Settings

## Problem Frame

GrowChat currently lets users reset a forgotten password via the email-based `/api/auth/forgot-password` + `/api/auth/reset-password` flow, but a logged-in user has no self-service way to change their password while already authenticated. The `/account/settings/**` drawer only exposes Connections, Models, and Integrations. This forces users to log out, trigger a reset email, and complete the flow just to update a known password.

## Scope

### In Scope

- Add a **Security** tab to the `/account/settings/**` drawer.
- Render a **Change Password** form in that tab: current password, new password, confirm new password.
- Add an authenticated backend endpoint that verifies the current password, hashes the new password, updates the user record, and bumps the session version to invalidate existing refresh tokens.
- Add backend unit tests, frontend unit tests, and at least one E2E flow.
- Update the auth API docs and account settings UX docs to include the new tab and endpoint.

### Out of Scope

- Email notification after a successful password change.
- Password complexity rules beyond the existing 8-character minimum.
- Admin ability to force a user password change.
- SSO/OAuth password flows.

### Deferred to Follow-Up Work

- Optional email notification on password change (when Resend is configured).
- Password strength indicator in the UI.
- Session/device management UI.

## Requirements

| ID  | Requirement                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------ |
| R1  | An authenticated user can open `/account/settings/security` and see a Change Password form.                                    |
| R2  | The form requires the current password, the new password, and a matching confirmation.                                         |
| R3  | The backend rejects mismatched confirmation passwords with a 400 response.                                                     |
| R4  | The backend rejects a new password shorter than 8 characters with a 400 response.                                              |
| R5  | The backend rejects an incorrect current password with a 401 response.                                                         |
| R6  | On success, the backend updates `users.password_hash` and bumps the session version, invalidating all existing refresh tokens. |
| R7  | The endpoint is rate-limited to 5 requests per IP per hour.                                                                    |
| R8  | The UI follows the existing Action Blue / Pill design system.                                                                  |

## Key Technical Decisions

### Backend route path: `POST /api/auth/change-password`

Placing the endpoint under `/api/auth/change-password` keeps it in the existing auth action namespace, reuses the `auth.js` router, and mirrors the existing `forgot-password` / `reset-password` naming. It is authenticated (requires a valid Bearer token), unlike the forgot/reset flows.

### Session invalidation via `bumpSessionVersion`

After a successful password change, all existing refresh tokens must be rejected. The project already uses `bumpSessionVersion(env, userId, { required: true })` in `src/routers/auth-password-reset.js`; the new endpoint will follow the same pattern. The current access token remains valid until its 15-minute TTL expires, at which point `apiFetch` will fail to refresh and redirect to `/auth.html`.

### No new migration

The `users` table already stores `password_hash`, and `bumpSessionVersion` uses the existing `session-version` KV key. No schema changes are required.

### Reuse existing utilities

- `verifyPassword()` and `hashPassword()` from `src/shared/auth.js`
- `checkRateLimit()` and `RATE_LIMITS` from `src/services/rate-limit.js`
- `bumpSessionVersion()` from `src/shared/session.js`
- `requireString()` and `validateEmail()` from `src/validation/request.js`

## Implementation Units

### U1. Backend: `POST /api/auth/change-password` endpoint and tests

**Goal:** Add an authenticated endpoint that changes the current user's password.

**Files:**

- `src/routers/auth-change-password.js` (new)
- `src/routers/auth.js` (wire route)
- `src/services/rate-limit.js` (add `authChangePassword` rate limit)
- `src/routers/auth-change-password.test.js` (new)

**Approach:**

- Create `handleChangePassword(req, env, db, users, requestContext)` that:
  1. Reads and validates `{ currentPassword, newPassword }`.
  2. Enforces minimum 8-character new password.
  3. Checks the `auth-change-password` rate limit.
  4. Loads the authenticated user via `users.findById(authUser.userId)`.
  5. Verifies `currentPassword` against `user.password_hash` using `verifyPassword()`.
  6. Calls `bumpSessionVersion(env, user.id, { required: true })`.
  7. Hashes `newPassword` with `hashPassword()`.
  8. Updates `users.password_hash`.
  9. Returns `{ success: true }`.
- Add `authChangePassword` to `RATE_LIMITS` with `limit: 5`, `windowSeconds: 3600`.
- Wire `POST /api/auth/change-password` in `authRouter()` after the reset-password handler; require an authenticated `authUser` (return 401 if missing).

**Patterns to follow:** `src/routers/auth-password-reset.js`, `src/routers/auth-password-reset.test.js`.

**Test scenarios:**

- Happy path: valid current password + matching new password → 200, password hash updated, session version bumped.
- Edge case: new password exactly 8 characters passes; 7 characters fails with 400.
- Error path: wrong current password → 401.
- Error path: mismatched new password confirmation → 400.
- Error path: missing current or new password → 400.
- Error path: rate limit exceeded → 429.
- Integration scenario: after success, `consumeRefreshToken()` rejects previously issued refresh tokens.

**Verification:** Unit tests pass; endpoint returns expected status codes and side effects.

### U2. Frontend: Security tab navigation

**Goal:** Add a **Security** tab to the account settings drawer navigation.

**Files:**

- `public/js/features/account/account.js`
- `public/js/features/account/account-utils.js`

**Approach:**

- Add `{ href: '#security', key: 'security', label: 'Security' }` to `getAccountNavItems()`.
- Update `normalizeAccountSection()` to accept `'security'`.
- Update `resolveAccountSectionFromPath()` to return `'security'` for `/account/settings/security`.
- Update `getAccountSectionPath()` to return `/account/settings/security`.
- Add `security: null` to `accountSectionRenderers` and lazy-load `account-security.js` in `loadAccountSectionRenderer()`.

**Patterns to follow:** Existing `models` and `integrations` sections in `account-utils.js`.

**Test scenarios:**

- Happy path: navigating to `/account/settings/security` renders the Security tab.
- Edge case: unknown section falls back to `connections`.
- Integration scenario: clicking the Security tab updates the URL and lazy-loads the renderer.

**Verification:** The Security tab appears in the drawer and resolves to the correct section.

### U3. Frontend: Change Password form renderer and tests

**Goal:** Render the Change Password form and wire it to the new endpoint.

**Files:**

- `public/js/features/account/account-security.js` (new)
- `public/js/features/account/account-security.test.js` (new)

**Approach:**

- Export `renderAccountSecuritySection(container, state)` that:
  1. Renders a form with three password fields: Current Password, New Password, Confirm New Password.
  2. Uses `type="password"` with a show/hide toggle for each field.
  3. Enforces `minlength="8"` and matching confirmation via client-side validation.
  4. Calls `apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) })`.
  5. Shows inline success or error messages.
- Style the form using Tailwind: Action Blue submit button (`#0066cc`), pill radius (`rounded-full`), `scale(0.95)` active state, `bg-[#f5f5f5]` card background, no drop shadow.

**Patterns to follow:** `public/js/features/account/account-connections.js` for section renderer shape; design rules from `docs/ui-ux/BUGS.md`.

**Test scenarios:**

- Happy path: submitting valid passwords calls the endpoint and shows success.
- Edge case: new password shorter than 8 characters shows inline validation error.
- Edge case: confirmation mismatch shows inline validation error before submission.
- Error path: 401 response from backend shows "Current password is incorrect".
- Error path: 429 response shows rate-limit message.

**Verification:** Unit tests pass; form renders correctly and submits the expected payload.

### U4. Documentation updates

**Goal:** Keep the developer wiki and API docs in sync with the new feature.

**Files:**

- `docs/backend/apis/auth.md`
- `docs/ui-ux/pages/settings-ux.md` (or equivalent account settings doc)

**Approach:**

- Add `POST /api/auth/change-password` to the auth API contract with request/response shape and error codes.
- Update the account settings navigation tree to list the Security tab and Change Password form.
- Note the rate limit and session-invalidation behavior.

**Verification:** Docs accurately describe the new endpoint and UI tab.

### U5. E2E coverage for change password flow

**Goal:** Verify the end-to-end flow from login through password change.

**Files:**

- `tests/e2e/frontend/account-security.spec.ts` (new)

**Approach:**

- Use the existing `chromium-auth` project storage state.
- Navigate to `/account/settings/security`.
- Fill current password, new password, confirmation.
- Submit and wait for `**/api/auth/change-password` response.
- Assert success message is visible.
- Optionally assert that a subsequent refresh attempt redirects to login.

**Patterns to follow:** `tests/e2e/frontend/auth.spec.ts`, `tests/e2e/frontend/connections.spec.ts`.

**Test scenarios:**

- Happy path: successful password change.
- Error path: wrong current password shows error.

**Verification:** E2E test passes against the local dev server.

## Risks & Mitigations

| Risk                                                                 | Mitigation                                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Session invalidation surprises users by logging them out on refresh. | Document the behavior; do not clear localStorage on success.                                                        |
| Rate-limit key collisions with forgot/reset flows.                   | Use a distinct `auth-change-password` action.                                                                       |
| Frontend validation bypassed.                                        | Backend validates password length and current password independently.                                               |
| Race condition between password update and concurrent requests.      | Bump session version before updating password so refresh tokens are already invalid if the update fails mid-flight. |

## Verification & Rollout

1. Run unit tests: `pnpm test`
2. Run E2E tests: `pnpm run test:e2e`
3. Build CSS: `pnpm run build:css`
4. Validate migrations: `pnpm run validate:migrations` (no new migration expected, but confirms schema)
5. Manual QA: log in, change password, verify old refresh tokens fail and new password works on next login.
