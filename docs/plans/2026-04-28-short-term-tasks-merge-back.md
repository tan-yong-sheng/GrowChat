# Short-Term Tasks Merge-Back Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Merge durable feature work from `.worktrees/short-term` into mainline safely, fix auth login regression, and keep only real product code, tests, and migrations.

**Architecture:** Treat `.worktrees/short-term` as a feature stream, not a raw merge candidate. First classify commits and files into durable feature work vs generated/debug artifacts, then merge only the durable slices into mainline. After merge, run targeted formatting, lint, typecheck, and Playwright verification on changed flows, and fix only the files touched by the merge unless a blocker proves the branch is structurally broken.

**Tech Stack:** Git worktrees, Cloudflare Workers, D1, vanilla JS SPA, Vitest, Playwright, ESLint, Prettier, TypeScript CLI, Husky, gstack browse/QA skills, Playwright CLI, AI vision for screenshot comparison when needed, Exa for external doc checks when a tool/API detail needs confirmation

---

### Task 1: Classify worktree commits and reject junk before merge

**Files:**

- Read: `.worktrees/short-term/.git`
- Read: `.worktrees/short-term/.worklog.jsonl` if it helps identify generated tasks
- Read: `.worktrees/short-term/docs/plans/2026-04-28-short-term-tasks-hardening.md`
- Read: `.worktrees/short-term/tests/e2e/frontend/auth.spec.ts`
- Read: `.worktrees/short-term/tests/e2e/fixtures/auth-state.json`
- Read: `.worktrees/short-term/package.json`

**Step 1: Inspect commit lineage**

Run:

```bash
git -C .worktrees/short-term log --oneline --decorate --reverse main..HEAD
```

Expected: identify feature commits vs later cleanup commits.

**Step 2: Inspect file delta**

Run:

```bash
git -C .worktrees/short-term diff --name-only main...HEAD
```

Expected: list durable product files and exclude generated/debug artifacts.

**Step 3: Classify merge set**

Keep for merge:

- migrations
- backend routers/services
- frontend feature code
- tests that cover merged behavior
- route registry / app bootstrap wiring only if needed

Reject from merge:

- `.pi-lens/`
- screenshots (`*.png`)
- debug scripts (`debug-auth.js`, `inspect-page.js`, `test-login.js`, `save-auth-state.js`, etc.)
- `nul`
- branch-local plan docs unless they replace mainline docs intentionally
- any temporary artifacts from e2e runs

**Step 4: Record merge list**

Write the keep/reject list into a small working note or plan appendix before editing code.

**Step 5: Commit only if classification changes repo files**

```bash
git add -A
git commit -m "chore: classify short-term merge set"
```

---

### Task 2: Reproduce and isolate auth login failure in the worktree

**Files:**

- Read/modify: `tests/e2e/frontend/auth.spec.ts`
- Read/modify: `tests/e2e/fixtures/auth-state.json`
- Read/modify: `public/js/bootstrap/auth.js`
- Read/modify: `public/js/bootstrap/session-bootstrap.js`
- Read/modify: `public/js/bootstrap/app.js`
- Read/modify: `src/routers/auth.js`
- Read/modify: `src/bootstrap/router-registry.js`

**Step 1: Run auth flow with Playwright**

Run the exact e2e auth spec from the worktree:

```bash
npx playwright test tests/e2e/frontend/auth.spec.ts --project=chromium-auth
```

Expected: fail or expose the real login breakage.

**Step 2: Capture browser evidence**

Use Playwright CLI or gstack browse/QA to capture the failing step, page state, and screenshot.
If the failure is visual/stateful, use AI vision on screenshots before changing code.

**Step 3: Trace the failure to source**

Check whether the bug is caused by:

- wrong auth state storage key/shape (`growchat_auth` vs older fixture shape)
- `ensureSession()` redirect path mismatch
- `/api/auth/login` response shape mismatch
- email verification route intercepting auth navigation
- static e2e server path mismatch (`8789` vs `3007`)

**Step 4: Write a minimal reproduction note**

Document exact failing URL, payload, and UI symptom in the plan notes.

**Step 5: Commit only if a real code fix lands**

```bash
git add public/js/bootstrap/auth.js public/js/bootstrap/session-bootstrap.js public/js/bootstrap/app.js src/routers/auth.js src/bootstrap/router-registry.js tests/e2e/frontend/auth.spec.ts tests/e2e/fixtures/auth-state.json
git commit -m "fix: restore auth login flow"
```

---

### Task 3: Merge backend feature slices only after auth is green

**Files:**

- Merge/modify: `src/routers/email-verification.js`
- Merge/modify: `src/routers/session-management.js`
- Merge/modify: `src/routers/message-edit.js`
- Merge/modify: `src/services/audit-log.js`
- Merge/modify: `src/services/rate-limit.js`
- Merge/modify: `src/shared/crypto.js`
- Merge/modify: `src/routers/email-verification.test.js`
- Merge/modify: `src/routers/session-management.test.js`
- Merge/modify: `src/routers/message-edit.test.js`
- Merge/modify: `src/services/audit-log.test.js`
- Merge/modify: `src/shared/crypto.test.js`

**Step 1: Diff each backend slice against mainline**

Run targeted diffs for each file family. Keep changes only if they are production-safe and covered by tests.

**Step 2: Merge minimal code, not generated state**

Preserve:

- real email verification flow
- real session management
- real message editing
- audit log service API
- production crypto path

Discard or rewrite:

- fake token hashing shortcuts
- module-global DB shortcuts where env-bound DB is required
- TODO-only email sender stubs if the feature depends on outbound email

**Step 3: Run targeted unit tests after each slice**

Run:

```bash
npm test -- src/shared/crypto.test.js src/routers/email-verification.test.js -v
npm test -- src/routers/session-management.test.js src/routers/message-edit.test.js -v
npm test -- src/services/audit-log.test.js -v
```

Expected: each slice passes before moving on.

**Step 4: Commit each slice separately**

Use one commit per durable slice so rollback stays easy.

---

### Task 4: Merge frontend feature wiring and verify with Playwright

**Files:**

- Merge/modify: `public/js/features/auth/verification-pending.js`
- Merge/modify: `public/js/features/auth/verification-success.js`
- Merge/modify: `public/js/features/account/sessions.js`
- Merge/modify: `public/js/features/admin/audit-logs.js`
- Merge/modify: `public/js/features/admin/admin.js`
- Merge/modify: `public/js/features/chat/chat-message-edit.js`
- Merge/modify: `public/js/bootstrap/app.js`
- Merge/modify: `public/js/bootstrap/auth.js`
- Merge/modify: `tests/e2e/frontend/auth.spec.ts`
- Merge/modify: `tests/e2e/frontend/chat.spec.ts`
- Merge/modify: `tests/e2e/frontend/admin-settings.spec.ts`

**Step 1: Review UI diffs before merge**

Check whether the UI code assumes the backend slices already landed.

**Step 2: Merge only durable UI code**

Keep:

- verification pending/success screens
- sessions UI
- audit logs UI
- message edit UI
- route bootstrap wiring needed for real navigation

Discard:

- screenshot assets
- debugging helpers
- temporary browser scripts

**Step 3: Verify with Playwright**

Run the impacted specs:

```bash
npx playwright test tests/e2e/frontend/auth.spec.ts --project=chromium-auth
npx playwright test tests/e2e/frontend/chat.spec.ts --project=chromium-auth
npx playwright test tests/e2e/frontend/admin-settings.spec.ts --project=chromium-auth
```

Expected: pass, or fail only on one clearly isolated UI issue.

**Step 4: Use screenshot comparison when needed**

If a UI regression is unclear, capture before/after screenshots and use AI vision to compare.

---

### Task 5: Merge schema and config changes only after code paths are stable

**Files:**

- Merge/modify: `migrations/004_email_verification.sql`
- Merge/modify: `migrations/005_message_editing.sql`
- Merge/modify: `migrations/006_audit_logging.sql`
- Merge/modify: `wrangler.jsonc`
- Merge/modify: `tests/unit/public-account-shell.test.js`
- Merge/modify: `tests/unit/public-audit-logs.test.js`
- Merge/modify: `tests/unit/public-sessions.test.js`
- Merge/modify: `playwright.config.ts` only if test paths or project names must match the merged tree

**Step 1: Confirm schema matches runtime code**

Check column names, indexes, and route assumptions.

**Step 2: Merge migrations only if required by the backend slices**

Do not merge unused migration files or config churn.

**Step 3: Run migration validation**

Run:

```bash
npm run validate:migrations
```

Expected: pass.

**Step 4: Commit schema/config changes**

```bash
git add migrations/004_email_verification.sql migrations/005_message_editing.sql migrations/006_audit_logging.sql wrangler.jsonc playwright.config.ts
git commit -m "chore: align schema and config for short-term features"
```

---

### Task 6: Re-run repository checks on changed files, then full gate if feasible

**Files:**

- All merged files from prior tasks

**Step 1: Run targeted lint/format on touched paths**

Run the exact formatter/linter paths for changed files first. If a touched file is malformed, fix it before anything else.

**Step 2: Run whole-repo checks only after touched files are clean**

Run:

```bash
npm run lint
npm run format:check
npm run typecheck
```

Expected: if these still fail, determine whether the failure is from merged files or pre-existing repo debt.

**Step 3: Document non-owned debt separately**

If full-repo checks still fail due to unrelated files, record that as follow-up cleanup instead of dragging it into this merge.

**Step 4: Final Playwright pass**

Re-run auth plus any flows affected by merge:

```bash
npx playwright test tests/e2e/frontend/auth.spec.ts --project=chromium-auth
```

Expected: auth login works and no regression from merged slices.

**Step 5: Commit final merge-back cleanup**

```bash
git add -A
git commit -m "chore: merge short-term worktree safely"
```

---

**Execution note:** Do not merge raw worktree tip. Merge durable slices only, keep generated/debug artifacts out, and verify auth/login with Playwright before calling the branch done.
