import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Authenticated accessibility', () => {
  test.use({ storageState: 'tests/e2e/fixtures/auth-state.json' });

  // AxeBuilder is exported as both named and default (CJS/ESM dual export).
  // TypeScript cannot resolve the construct signature from .d.ts under
  // NodeNext moduleResolution, but the default import is the class at runtime.
  type AxeCtor = new (opts: { page: import('playwright-core').Page }) => {
    analyze: () => Promise<{ violations: unknown[] }>;
  };
  const Builder = AxeBuilder as unknown as AxeCtor;

  test('chat workspace has no a11y violations', async ({ page }) => {
    // Use ?app=1 to bypass the landing page and load the SPA directly.
    await page.goto('/?app=1');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new Builder({
      page,
    }).analyze();

    // Blocking: any axe-core violation fails the test.
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('admin users overview has no a11y violations', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForURL(/\/admin\/users\/overview$/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new Builder({
      page,
    }).analyze();

    // Blocking: any axe-core violation fails the test.
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
