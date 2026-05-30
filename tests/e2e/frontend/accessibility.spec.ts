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

  // The SPA at / redirects unauthenticated users to /auth.html, so the home
  // page test waits for that redirect before scanning. Chat/admin routes
  // require auth and are not scannable in the guest project (see issue #123).
  // landing.html has pre-existing color-contrast violations (see issue #131).

  test('should not have any automatically detectable accessibility issues on home page', async ({
    page,
  }) => {
    // The SPA at / redirects to /auth.html when no auth token is present.
    // Wait for the redirect to complete before scanning.
    await page.goto('/');
    await page.waitForURL(/\/auth(\.html)?$/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new Builder({
      page,
    }).analyze();

    // Blocking: any axe-core violation fails the test.
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should not have any automatically detectable accessibility issues on /auth.html', async ({
    page,
  }) => {
    await page.goto('/auth.html');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new Builder({
      page,
    }).analyze();

    // Blocking: any axe-core violation fails the test.
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
