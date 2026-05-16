# Short-Term Tasks Hardening Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Finish short-term feature branch so email verification, session management, message editing, and audit logging are real, testable, and safe to merge.

**Architecture:** Keep feature work inside `.worktrees/short-term` until blockers are gone. Use existing router/service patterns in `src/routers`, `src/services`, and `public/js/features`, and wire everything through `src/bootstrap/router-registry.js` and `public/js/bootstrap/app.js` only when contracts are stable. Prefer small DB-backed services, explicit tests for edge cases, and no fake crypto paths in production code.

**Tech Stack:** Cloudflare Workers, D1, KV, vanilla JS SPA, Vitest, Tailwind CSS, Cloudflare email service integration.

---

### Task 1: Replace fake token hashing with production-safe crypto

**Files:**

- Modify: `src/shared/crypto.js`
- Test: `src/shared/crypto.test.js` or existing crypto test file if already present
- Test: `src/routers/email-verification.test.js`

**Step 1: Write the failing test**

Add a test that proves the sync `hashToken()` path cannot be used in production code. The test should expect either a thrown error or a removed export. Also add a test that `hashTokenAsync()` returns a stable SHA-256 hex string for the same input.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/shared/crypto.test.js src/routers/email-verification.test.js -v`
Expected: FAIL because `hashToken()` still returns a fake prefix hash.

**Step 3: Write minimal implementation**

Remove the fake sync implementation or make it throw `use hashTokenAsync`. Keep `generateToken()`, `hashTokenAsync()`, and `constantTimeEquals()`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/shared/crypto.test.js src/routers/email-verification.test.js -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/shared/crypto.js src/shared/crypto.test.js src/routers/email-verification.test.js
git commit -m "fix: remove fake token hashing path"
```

---

### Task 2: Finish email verification end to end

**Files:**

- Modify: `src/routers/email-verification.js`
- Modify: `src/routers/auth.js`
- Modify: `src/services/email/email-service.js` or current email sender helper
- Modify: `migrations/004_email_verification.sql` if schema needs a small tweak
- Test: `src/routers/email-verification.test.js`
- Test: `src/routers/auth.test.js`
- Test: `tests/e2e/frontend/auth.spec.ts` if UI flow exists

**Step 1: Write the failing test**

Add a test that `resendVerification()` sends email through the existing email service and stores a fresh verification token. Add a test that `verifyEmail()` activates only valid, unexpired tokens and deletes the token row afterward.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/routers/email-verification.test.js src/routers/auth.test.js -v`
Expected: FAIL because email sending is still stubbed and the service path is incomplete.

**Step 3: Write minimal implementation**

Wire `createEmailService(env)` into `createEmailVerification()` and `resendVerification()`. Build a real verification email with a link to `/auth/verify-email?token=...`. Keep the success response generic so email enumeration stays blocked. Make sure the router uses `env.DB` consistently and does not rely on a module-global DB.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/routers/email-verification.test.js src/routers/auth.test.js -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/routers/email-verification.js src/routers/auth.js src/services/email/email-service.js src/routers/email-verification.test.js src/routers/auth.test.js
git commit -m "feat: complete email verification flow"
```

---

### Task 3: Harden verification and resend flow against abuse

**Files:**

- Modify: `src/routers/auth.js`
- Modify: `src/services/rate-limit.js`
- Modify: `src/routers/email-verification.js`
- Test: `src/routers/email-verification.test.js`
- Test: `src/routers/auth.test.js`

**Step 1: Write the failing test**

Add tests for these cases:

- same email cannot trigger infinite resend spam
- invalid token format gets rejected early
- already-active account still returns a generic success message

**Step 2: Run test to verify it fails**

Run: `npm test -- src/routers/email-verification.test.js src/routers/auth.test.js -v`
Expected: FAIL on missing per-email throttling and token format guard.

**Step 3: Write minimal implementation**

Add a second rate-limit dimension keyed by email address in `authResendVerification`. Add token format validation before hashing. Keep generic responses for nonexistent or active accounts.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/routers/email-verification.test.js src/routers/auth.test.js -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/routers/auth.js src/services/rate-limit.js src/routers/email-verification.js src/routers/email-verification.test.js src/routers/auth.test.js
git commit -m "fix: harden verification resend flow"
```

---

### Task 4: Finish session management with real ownership and expiry behavior

**Files:**

- Modify: `src/routers/session-management.js`
- Modify: `src/routers/auth.js` if login needs to store session metadata
- Modify: `src/shared/session.js` or existing session helper if metadata belongs there
- Test: `src/routers/session-management.test.js`
- Test: `tests/unit/public-sessions.test.js`

**Step 1: Write the failing test**

Add tests that:

- list only non-expired sessions
- revoke only the requesting user’s own session
- preserve stable ordering by recent activity
- show clear empty state when KV binding is missing

**Step 2: Run test to verify it fails**

Run: `npm test -- src/routers/session-management.test.js tests/unit/public-sessions.test.js -v`
Expected: FAIL on expiry handling or metadata mismatch.

**Step 3: Write minimal implementation**

Store session metadata at login/refresh with `userId`, `device`, `ip`, `lastActive`, and `expiresAt`. Filter expired rows on list. Delete stale KV entries when detected. Keep revoke path strict on user ownership.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/routers/session-management.test.js tests/unit/public-sessions.test.js -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/routers/session-management.js src/routers/auth.js src/shared/session.js src/routers/session-management.test.js tests/unit/public-sessions.test.js
git commit -m "feat: complete session management flow"
```

---

### Task 5: Fix audit logging API and admin UI contract

**Files:**

- Modify: `src/services/audit-log.js`
- Modify: `src/routers/admin.js`
- Modify: `public/js/features/admin/audit-logs.js`
- Modify: `public/js/features/admin/admin.js`
- Modify: `migrations/006_audit_logging.sql` if schema needs contract changes
- Test: `src/services/audit-log.test.js`
- Test: `tests/unit/public-audit-logs.test.js`
- Test: `src/routers/admin.test.js`

**Step 1: Write the failing test**

Add tests that verify the admin endpoint and the audit service return the same field names, especially `user_id`, `resource_type`, `resource_id`, and `details`. Add a UI test for filter and export behavior against that shape.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/services/audit-log.test.js src/routers/admin.test.js tests/unit/public-audit-logs.test.js -v`
Expected: FAIL because the backend and frontend shapes are not aligned yet.

**Step 3: Write minimal implementation**

Standardize on one audit log shape. Either adapt `src/services/audit-log.js` to what admin UI consumes, or make the UI consume the backend contract directly. Remove the `utils/authorize.js` vs `services/audit-log.js` split if it causes duplicate sources of truth. Keep query params, pagination, and JSON encoding consistent.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/services/audit-log.test.js src/routers/admin.test.js tests/unit/public-audit-logs.test.js -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/audit-log.js src/routers/admin.js public/js/features/admin/audit-logs.js public/js/features/admin/admin.js migrations/006_audit_logging.sql src/services/audit-log.test.js src/routers/admin.test.js tests/unit/public-audit-logs.test.js
git commit -m "feat: align audit log backend and admin ui"
```

---

### Task 6: Complete message editing with history and safe UI state

**Files:**

- Modify: `src/routers/message-edit.js`
- Modify: `public/js/features/chat/chat-message-edit.js`
- Modify: `migrations/005_message_editing.sql`
- Modify: `src/bootstrap/router-registry.js` if route registration is needed
- Modify: `public/js/bootstrap/app.js` if route wiring is needed
- Test: `src/routers/message-edit.test.js`
- Test: `tests/unit/public-chat-message-edit.test.js` if not present yet

**Step 1: Write the failing test**

Add a test that editing a message stores prior content in `message_edits` and sets `edited_at` on `messages`. Add a UI test for cancel, save, and escape key paths.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/routers/message-edit.test.js tests/unit/public-chat-message-edit.test.js -v`
Expected: FAIL because history write and UI behavior are incomplete.

**Step 3: Write minimal implementation**

Persist edit history before updating the message. Only allow owner edits. Ensure the editor restores original HTML on cancel and does not leave stale event handlers behind after save or cancel.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/routers/message-edit.test.js tests/unit/public-chat-message-edit.test.js -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/routers/message-edit.js public/js/features/chat/chat-message-edit.js migrations/005_message_editing.sql src/routers/message-edit.test.js tests/unit/public-chat-message-edit.test.js
git commit -m "feat: finish message editing with history"
```

---

### Task 7: Register routes and run full verification gate

**Files:**

- Modify: `src/bootstrap/router-registry.js`
- Modify: `public/js/bootstrap/app.js`
- Modify: `public/js/features/account/account.js` if security/session UI needs route updates
- Modify: `public/js/features/admin/admin.js` if new admin paths need polish
- Test: `npm test`
- Test: `npm run validate:migrations`
- Test: `npm run build:css`

**Step 1: Write the failing test**

Add or update route-level tests that prove the new endpoints are reachable through the registry and that the frontend nav links point to the right views.

**Step 2: Run test to verify it fails**

Run: `npm test -v`
Expected: FAIL until route registration and nav wiring are complete.

**Step 3: Write minimal implementation**

Add only the route registrations needed for the completed feature surfaces. Do not add extra abstraction. Keep the bootstrap layer thin.

**Step 4: Run test to verify it passes**

Run:

- `npm run validate:migrations`
- `npm run build:css`
- `npm test`
  Expected: PASS.

**Step 5: Commit**

```bash
git add src/bootstrap/router-registry.js public/js/bootstrap/app.js public/js/features/account/account.js public/js/features/admin/admin.js
git commit -m "chore: wire completed short-term features"
```

---

### Task 8: Final review and merge readiness check

**Files:**

- None new, use branch diff

**Step 1: Run focused review commands**

Run:

- `git diff main...feature/short-term-tasks --stat`
- `npm test`
- `npm run validate:migrations`
- `git diff main...feature/short-term-tasks`

**Step 2: Verify merge criteria**

Confirm:

- no fake crypto paths remain
- email verification sends real mail
- audit logs backend and UI agree on payload shape
- session revoke/list works with ownership checks
- message editing keeps history and passes tests

**Step 3: Commit or stop**

If all green, prepare merge. If any blocker remains, stop and write one short note in the plan about what is still missing.

---

## Notes for implementation

- Stay in `.worktrees/short-term` until this branch is clean.
- Keep tests close to behavior. One test per bug or contract, not giant catch-all files.
- Any new data shape must be visible in both backend test and UI test.
- Prefer explicit failure over silent fallback for security-sensitive paths.

## Execution order

1. Crypto cleanup
2. Email verification completion
3. Verification abuse hardening
4. Session management finish
5. Audit log contract alignment
6. Message editing history
7. Route wiring + full verification
8. Merge decision
