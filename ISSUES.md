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
