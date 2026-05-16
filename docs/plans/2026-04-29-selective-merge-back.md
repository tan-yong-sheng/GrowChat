# Selective Merge-Back From Short-Term Worktree Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Merge durable feature slices from `.worktrees/short-term` into mainline without dragging debug junk, while preserving verified auth login behavior and current e2e coverage.

**Architecture:** Treat the short-term worktree as a candidate patch set, not a raw merge target. First classify files into merge-now / hold / drop, then normalize auth-related e2e config so tests use environment-driven credentials and config-driven base URLs. After that, verify the touched auth/browser flows with Playwright and only merge the durable slices that pass targeted checks.

**Tech Stack:** Git worktrees, Cloudflare Workers, D1, vanilla JS SPA, Playwright, Vitest, ESLint, Prettier, Husky, local dev server, browser verification

---

### Task 1: Classify short-term diff and lock merge boundary

**Files:**

- Read: `.worktrees/short-term` git history and status
- Read: `docs/plans/2026-04-28-short-term-tasks-merge-back.md`
- Read: `docs/plans/2026-04-28-ci-mirror-guardrails.md` if needed for boundary decisions
- Read: `.worktrees/short-term/tests/e2e/frontend/auth.spec.ts`
- Read: `.worktrees/short-term/tests/e2e/frontend/admin-settings.spec.ts`
- Read: `.worktrees/short-term/tests/e2e/frontend/chat.spec.ts`
- Read: `.worktrees/short-term/tests/e2e/fixtures/auth-state.json`
- Read: `.worktrees/short-term/tests/e2e/playwright.config.ts`
- Read: `.worktrees/short-term/package.json`

**Step 1: Inspect diff scope**

Run:

```bash
git -C .worktrees/short-term status --short
git -C .worktrees/short-term diff --name-only main...HEAD
```

Expected: clear list of durable source files, tests, docs, and junk artifacts.

**Step 2: Classify files**

Keep for merge:

- production code
- regression tests for durable behavior
- config required for those tests

Hold for later:

- broad unrelated feature slices not needed for current auth/browser path

Drop from merge:

- screenshots
- debug scripts
- `.pi-lens/`
- temp files like `nul`
- branch-local scratch artifacts

**Step 3: Write merge boundary note**

Record keep/hold/drop list in current plan notes or a short working note so merge scope stays fixed.

**Step 4: Commit only if boundary note changes repo files**

```bash
git add -A
git commit -m "chore: lock selective merge boundary"
```

---

### Task 2: Normalize auth e2e flow to env-driven creds and config-driven URLs

**Files:**

- Modify: `.worktrees/short-term/tests/e2e/frontend/auth.spec.ts`
- Modify: `.worktrees/short-term/tests/e2e/frontend/admin-settings.spec.ts`
- Modify: `.worktrees/short-term/tests/e2e/frontend/chat.spec.ts`
- Modify: `.worktrees/short-term/tests/e2e/frontend/bootstrap.spec.ts`
- Modify: `.worktrees/short-term/tests/e2e/playwright.config.ts`
- Modify: `.worktrees/short-term/tests/e2e/fixtures/auth-state.json` only if the auth-state origin must match config

**Step 1: Write the failing contract first**

Add or preserve checks so auth e2e fails fast when `TEST_EMAIL` / `TEST_PASSWORD` are missing, and all page navigations use relative URLs.

Expected contract:

- auth spec reads `TEST_EMAIL` and `TEST_PASSWORD`
- page paths use `/auth.html` and `/`
- test config owns host/port via `baseURL`
- auth-state fixture origin matches configured host

**Step 2: Remove hard-coded host strings from specs**

Replace `http://localhost:8789` and similar literals with relative navigation.
Keep `localhost` only in Playwright config or fixture data if config still requires it.

**Step 3: Align bootstrap spec with test server**

If `bootstrap.spec.ts` is part of the merged set, point it at the same base URL strategy so it does not fight config or assume a different port.

**Step 4: Run a small validation pass**

Run:

```bash
npx playwright test tests/e2e/frontend/auth.spec.ts --project=chromium-guest
```

Expected: skip cleanly if env vars missing, or pass with real creds set.

**Step 5: Commit the e2e normalization**

```bash
git add tests/e2e/frontend/auth.spec.ts tests/e2e/frontend/admin-settings.spec.ts tests/e2e/frontend/chat.spec.ts tests/e2e/frontend/bootstrap.spec.ts tests/e2e/playwright.config.ts tests/e2e/fixtures/auth-state.json
git commit -m "test: normalize auth e2e config"
```

---

### Task 3: Verify auth/browser login on real local server

**Files:**

- Read/modify: `.worktrees/short-term/src/middleware/cors.js`
- Read/modify: `.worktrees/short-term/src/middleware/cors.test.js`
- Read/modify: `.worktrees/short-term/src/routers/auth.js`
- Read/modify: `.worktrees/short-term/public/js/bootstrap/auth.js`
- Read/modify: `.worktrees/short-term/public/js/bootstrap/session-bootstrap.js`
- Read/modify: `.worktrees/short-term/tests/e2e/frontend/auth.spec.ts`

**Step 1: Run targeted unit coverage for origin handling**

Run:

```bash
npm test -- src/middleware/cors.test.js src/routers/auth.test.js
```

Expected: pass; wildcard origin behavior still accepts development config.

**Step 2: Run browser login flow**

Run with the real local server and env creds:

```bash
TEST_EMAIL=... TEST_PASSWORD=... npx playwright test tests/e2e/frontend/auth.spec.ts --project=chromium-guest
```

Expected: login succeeds, redirect reaches `/`, logged-in UI marker appears.

**Step 3: Check browser evidence if needed**

If the test fails, inspect actual browser response and DOM instead of guessing from fixture shape or stale selectors.

**Step 4: Commit only if auth flow is green**

```bash
git add src/middleware/cors.js src/middleware/cors.test.js src/routers/auth.js public/js/bootstrap/auth.js public/js/bootstrap/session-bootstrap.js tests/e2e/frontend/auth.spec.ts
git commit -m "fix: preserve browser auth flow"
```

---

### Task 4: Merge durable product slices, reject generated/debug artifacts

**Files:**

- Merge/modify: only durable files already classified in Task 1
- Reject: screenshots, ad hoc scripts, temp notes, generated artifacts

**Step 1: Apply selective merge only**

Cherry-pick or copy only classified durable slices into mainline.
Do not merge raw worktree tip.

**Step 2: Re-check status before commit**

Run:

```bash
git status --short
```

Expected: only intended source/tests/docs remain, no debug artifacts.

**Step 3: Commit merged slices in small groups**

Use one commit per coherent slice if possible so rollback stays simple.

**Step 4: Record any held slices**

If a slice depends on unresolved upstream work, note it as hold instead of forcing merge.

---

### Task 5: Run targeted repo checks on touched paths, then final validation

**Files:**

- All files changed by Tasks 2-4

**Step 1: Run file-focused formatting/linting**

Run the minimal relevant checks for touched JS files and tests.

Expected: no formatter or lint errors on changed paths.

**Step 2: Run targeted unit and e2e checks**

Run:

```bash
npm test
npx playwright test tests/e2e/frontend/auth.spec.ts --project=chromium-guest
```

Expected: touched auth path passes; unrelated repo debt stays separated.

**Step 3: Run migration/config validation only if schema or worker config changed**

Run:

```bash
npm run validate:migrations
```

Expected: pass if any migration files or schema assumptions landed.

**Step 4: Final commit for safe merge-back**

```bash
git add -A
git commit -m "chore: merge short-term slices safely"
```

---

**Execution note:** If any step exposes more junk than product value, stop and reclassify before merging further. Keep auth/browser proof current, keep URLs relative in specs, and keep creds in env vars, not source.
