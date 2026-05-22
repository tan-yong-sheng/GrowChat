import { test } from '@playwright/test';

import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility audit', () => {
  // Tier 2: Report-only — violations are logged but don't fail CI.
  // Tier 4 (#102): Fix violations, then replace softAssert with strict
  //   expect(violations).toEqual([]) to make this blocking.
  test('should not have any automatically detectable accessibility issues on home page', async ({
    page,
  }) => {
    await page.goto('/');

    // AxeBuilder is exported as both named and default (CJS/ESM dual export).
    // TypeScript cannot resolve the construct signature from .d.ts under
    // NodeNext moduleResolution, but the default import is the class at runtime.
    const Builder = AxeBuilder as unknown as new (opts: {
      page: import('playwright-core').Page;
    }) => { analyze: () => Promise<{ violations: unknown[] }> };

    const accessibilityScanResults = await new Builder({
      page,
    }).analyze();

    // Report-only: log violations without failing the build.
    // Replace with: expect(accessibilityScanResults.violations).toEqual([]);
    if (accessibilityScanResults.violations.length > 0) {
      console.warn(
        `[a11y] ${accessibilityScanResults.violations.length} violation(s) found (report-only, not blocking):`,
        JSON.stringify(accessibilityScanResults.violations.map((v: any) => v.id))
      );
    }
  });
});
