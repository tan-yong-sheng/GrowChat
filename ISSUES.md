# Issues

## Codex Adversarial Review — Search Modal Spacing Test

**Date:** 2026-04-03  
**Verdict:** needs-attention  
**Target:** `tests/e2e/frontend/verify-search-modal-spacing.spec.ts`

### Issue 1: Spacing assertion can be skipped [MEDIUM]

**Location:** `tests/e2e/frontend/verify-search-modal-spacing.spec.ts:48-68`

**Problem:**
The spec only measures vertical spacing inside `if (resultItems.length >= 2)`, but it merely asserts `>= 1` first. If the seeded account or query returns one result, the core spacing assertion never runs and the test passes without validating the regression it claims to guard.

**Impact:**
The test can pass without actually proving the spacing behavior works. A regression in spacing could slip through if the search query happens to return fewer than two results.

**Recommendation:**
- Fail when fewer than two visible results are present, or
- Seed deterministic chat data so the spacing assertion always runs against a known result set

---

### Issue 2: Touch-target assertion is below stated threshold [MEDIUM]

**Location:** `tests/e2e/frontend/verify-search-modal-spacing.spec.ts:162-168`

**Problem:**
The test comment states 44px is the recommended minimum touch-target size, but the assertion only requires `>= 32`. This means a clearly suboptimal target size can still pass, so the spec cannot catch the accessibility regression it advertises.

**Impact:**
The test enforces a weaker standard than intended. Accessibility regressions below 44px would not be caught.

**Recommendation:**
- Align the assertion with the stated requirement by checking for at least 44px, or
- Rewrite the test/comment so the enforced threshold matches the intended UX standard

---

## Codex Adversarial Review — Comprehensive Main Branch Analysis

**Date:** 2026-04-03  
**Verdict:** needs-attention  
**Target:** `src/`, `public/`, `tests/`, `migrations/`, `docs/` on main branch

### Issue 3: Search spacing spec hardcodes unreachable server [HIGH]

**Location:** `tests/e2e/frontend/debug-search-modal-spacing.spec.ts:7-155`

**Problem:**
This spec hardcodes `http://localhost:8788` for both test flows. The repo's Playwright config launches a static server on `127.0.0.1:3007`, and the debug project baseURL is `127.0.0.1:8787`. These hardcoded navigations will time out or hit nothing under normal `playwright test` runs.

**Impact:**
The test is dead-on-arrival unless a separate manual server is running on port 8788. It will fail silently in CI and on any developer machine without that specific port running.

**Recommendation:**
- Use the configured baseURL or `page.goto('/')` instead of hardcoded host
- Parameterize any special debug port through Playwright config or environment variable

---

### Issue 4: Placeholder spec writes to machine-specific path [HIGH]

**Location:** `tests/e2e/frontend/debug-search-placeholder.spec.ts:67-80`

**Problem:**
Both screenshot calls use `/c/Users/tys/Documents/Coding/GrowChat/...`, a host-specific WSL-style absolute path. On CI or any non-matching machine, `page.screenshot()` will fail because that directory does not exist.

**Impact:**
The spec is non-portable and will break outside the author's machine. CI runs will fail with path-not-found errors.

**Recommendation:**
- Write screenshots to `test.info().outputPath(...)` or another repo-relative artifact path instead of fixed absolute paths

---

### Issue 5: Spacing assertion can be skipped on sparse result sets [MEDIUM]

**Location:** `tests/e2e/frontend/debug-search-modal-spacing.spec.ts:55-106`

**Problem:**
The only vertical-spacing check is inside `if (resultItems.length >= 2)`, but the test passes as soon as it sees a single result. If the query returns one item, the core regression check never runs and the spec still succeeds.

**Impact:**
False confidence for the layout regression the test is supposed to protect. Spacing regressions could slip through if the search query happens to return sparse results.

**Recommendation:**
- Fail when fewer than two visible results are present, or
- Seed deterministic chat data so the spacing assertion always runs against a known result set
