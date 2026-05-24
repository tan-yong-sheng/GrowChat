import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility audit', () => {
  // AxeBuilder is exported as both named and default (CJS/ESM dual export).
  // TypeScript cannot resolve the construct signature from .d.ts under
  // NodeNext moduleResolution, but the default import is the class at runtime.
  type AxeCtor = new (opts: { page: import('playwright-core').Page }) => {
    analyze: () => Promise<{ violations: unknown[] }>;
  };
  const Builder = AxeBuilder as unknown as AxeCtor;

  const publicRoutes = ['/', '/auth'];

  for (const route of publicRoutes) {
    test(`should not have any automatically detectable accessibility issues on ${route === '/' ? 'home page' : route}`, async ({
      page,
    }) => {
      await page.goto(route);

      const accessibilityScanResults = await new Builder({
        page,
      }).analyze();

      // Blocking: any axe-core violation fails the test.
      expect(accessibilityScanResults.violations).toEqual([]);
    });
  }
});
