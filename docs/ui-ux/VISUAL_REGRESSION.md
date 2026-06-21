# Visual Regression Testing

## Overview

Visual regression testing catches unintended UI changes caused by CSS, HTML, or Tailwind modifications. GrowChat uses **Playwright's native `toHaveScreenshot()`** — a free, built-in visual regression tool with no SaaS dependency.

### Why Playwright Native VRT?

- **Zero cost** — included with Playwright, no per-screenshot fees
- **Built-in diffing** — generates pixel-diff PNGs showing exactly what changed
- **CI-ready** — GitHub Actions integration via status checks
- **No lock-in** — baselines are plain PNGs committed to git

### What It Catches

- CSS regressions (wrong colors, spacing, shadows)
- Layout shifts (elements overlapping, misaligned)
- Font rendering changes (size, weight, family)
- Responsive breakpoints breaking
- Animation/transition regressions

---

## Running Tests Locally

### First Run (Creates Baselines)

```bash
TEST_URL=http://localhost:8787 \
pnpm exec playwright test tests/e2e/frontend/visual-regression.spec.ts --update-snapshots
```

This creates baseline PNGs in `tests/e2e/frontend/visual-regression.spec.ts-snapshots/`. **Commit these to git** — they're the shared "truth" for all developers and CI.

### Subsequent Runs (Compares to Baselines)

```bash
TEST_URL=http://localhost:8787 \
pnpm exec playwright test tests/e2e/frontend/visual-regression.spec.ts
```

If the current UI matches the baseline: ✅ PASS.  
If there's a visual difference: ❌ FAIL + diff PNG generated.

### Update Baselines After Intentional Changes

```bash
TEST_URL=http://localhost:8787 \
pnpm exec playwright test tests/e2e/frontend/visual-regression.spec.ts --update-snapshots
```

Then commit the updated baseline PNGs.

---

## Baseline Storage

### Location

```text
tests/e2e/frontend/visual-regression.spec.ts-snapshots/
├── auth-login-desktop.png
├── auth-login-mobile.png
├── chat-list-desktop.png
├── chat-list-mobile.png
├── admin-settings-desktop.png
└── admin-settings-mobile.png
```

### Naming Convention

`{test-name}-{viewport}.png`

- `auth-login-desktop.png` — 1280×720 viewport
- `auth-login-mobile.png` — 375×667 viewport

### Commit Baselines

Baselines are **version-controlled** — they're the shared truth. When you update a baseline:

1. Run `--update-snapshots`
2. Commit the new PNG
3. Push to git

All developers and CI compare against the same baseline.

---

## When to Update Baselines

### ✅ Update When

- Intentional design changes (new colors, spacing, layout)
- Fixing a visual bug (the "buggy" baseline is wrong)
- Adding a new page/route (first run creates baseline)

### ❌ Never Update When

- Hiding a regression ("it looks fine to me")
- Avoiding test failures ("I'll fix it later")
- Cross-browser differences (stick to Chromium for consistency)

---

## Common Issues

### Flaky Tests

**Symptom:** Test passes locally but fails in CI, or vice versa.

**Fix:** Increase `maxDiffPixelRatio` to `0.02` (2% pixel difference allowed):

```typescript
await expect(page).toHaveScreenshot('page.png', {
  maxDiffPixelRatio: 0.02,
});
```

### Dynamic Content (Timestamps, Avatars)

**Symptom:** Test fails because timestamps or user avatars change every run.

**Fix:** Mask dynamic elements:

```typescript
await expect(page).toHaveScreenshot('page.png', {
  mask: [page.locator('[data-testid="timestamp"]'), page.locator('[data-testid="user-avatar"]')],
});
```

### Font Rendering Differences

**Symptom:** Baseline created on macOS fails on Linux CI.

**Fix:** Use consistent font rendering flags in `playwright.config.ts`:

```typescript
use: {
  launchOptions: {
    args: [
      '--disable-gpu',
      '--force-device-scale-factor=1',
    ],
  },
},
```

### Animations Causing Instability

**Symptom:** Test fails intermittently due to mid-animation screenshots.

**Fix:** Disable animations:

```typescript
await expect(page).toHaveScreenshot('page.png', {
  animations: 'disabled',
});
```

---

## Integration with CI

### GitHub Actions Workflow

The workflow `.github/workflows/visual-regression.yml` runs on every PR and push to `main`:

1. Installs dependencies
2. Starts dev server
3. Runs visual regression tests
4. Uploads diff PNGs on failure

### Status Check

The "Visual Regression" job is a **required status check** — PRs cannot merge until it passes.

### Diff Review

When a test fails, Playwright generates:

- `test-results/{test-name}-actual.png` — current screenshot
- `test-results/{test-name}-expected.png` — baseline
- `test-results/{test-name}-diff.png` — pixel diff highlighting changes

Download the artifact from GitHub Actions to review.

---

## Vibe Coding Workflow

### After AI Generates CSS/HTML Changes

1. Run visual tests:

   ```bash
   TEST_URL=http://localhost:8787 \
   pnpm exec playwright test tests/e2e/frontend/visual-regression.spec.ts
   ```

2. If baseline **fails**:
   - Download diff PNG from `test-results/`
   - Review: is the change intentional?
   - If yes: `--update-snapshots` and commit new baseline
   - If no: fix the CSS/HTML to match baseline

3. If baseline **passes**:
   - Safe to commit — no visual regressions

### Example: Fixing a Regression

```bash
# Test fails — diff shows button color changed from #171717 to #0066cc
TEST_URL=http://localhost:8787 pnpm exec playwright test visual-regression.spec.ts

# Review diff PNG — confirms unintended color change
open test-results/auth-login-desktop-diff.png

# Fix the CSS
# (change bg-[#0066cc] back to bg-primary)

# Re-run test — now passes
TEST_URL=http://localhost:8787 pnpm exec playwright test visual-regression.spec.ts
```

---

## Adding New Pages

To add visual regression for a new page:

1. Add a test to `visual-regression.spec.ts`:

```typescript
test('new page matches baseline', async ({ page }) => {
  await page.goto('/new-page');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot('new-page.png', {
    maxDiffPixelRatio: 0.02,
    animations: 'disabled',
  });
});
```

2. Run with `--update-snapshots` to create baseline:

```bash
TEST_URL=http://localhost:8787 \
pnpm exec playwright test visual-regression.spec.ts --update-snapshots
```

3. Commit the new baseline PNG.

---

## Troubleshooting

### "Snapshot does not exist"

First run — use `--update-snapshots` to create baseline.

### "Snapshot mismatch"

Visual change detected. Review diff PNG:

- Intentional? → `--update-snapshots`
- Regression? → fix the CSS/HTML

### "Timeout waiting for networkidle"

Page has long-polling requests. Increase timeout:

```typescript
test.setTimeout(30000);
```

Or use `domcontentloaded` instead of `networkidle`:

```typescript
await page.waitForLoadState('domcontentloaded');
```

### "Auth state file not found"

Run auth setup first:

```bash
TEST_EMAIL=admin@localhost TEST_PASSWORD=admin123 \
pnpm exec playwright test tests/e2e/frontend/auth.setup.spec.ts
```

This creates `tests/e2e/fixtures/auth-state.json`.

---

## Resources

- [Playwright Visual Comparison Docs](https://playwright.dev/docs/test-snapshots)
- [toHaveScreenshot API](https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-1)
- [Masking Dynamic Content](https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-1-option-mask)
- [Playwright CI Guide](https://playwright.dev/docs/ci)
