import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility audit', () => {
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

    // Blocking: any axe-core violation fails the test.
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
