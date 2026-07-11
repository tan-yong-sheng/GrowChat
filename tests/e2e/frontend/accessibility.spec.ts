import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility audit', () => {
  // AxeBuilder is exported as both named and default (CJS/ESM dual export).
  // TypeScript cannot resolve the construct signature from .d.ts under
  // NodeNext moduleResolution, but the default import is the class at runtime.
  type AxeCtor = new (opts: { page: import('playwright').Page }) => {
    analyze: () => Promise<{ violations: unknown[] }>;
  };
  const Builder = AxeBuilder as unknown as AxeCtor;

  // The SPA at / redirects unauthenticated users to /auth.html, so the home
  // page test waits for that redirect before scanning. Chat/admin routes
  // require auth and are not scannable in the guest project (see issue #123).

  test('should not have any automatically detectable accessibility issues on home page', async ({
    page,
  }) => {
    // The SPA at /?app=1 bypasses the landing page and redirects to /auth.html
    // when no auth token is present. We use ?app=1 because the server serves
    // landing.html for bare / requests (see maybeServeLandingPage in src/index.js).
    await page.goto('/?app=1');
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

  test('should not have any automatically detectable accessibility issues on /landing.html', async ({
    page,
  }) => {
    await page.goto('/landing.html');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new Builder({
      page,
    }).analyze();

    // Blocking: any axe-core violation fails the test.
    // Resolves 96 color-contrast violations from issue #131 by darkening
    // text colors to meet WCAG 2 AA (4.5:1 normal, 3:1 large).
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
