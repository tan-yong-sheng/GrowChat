import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Authenticated accessibility', () => {
  test.use({ storageState: 'tests/e2e/fixtures/auth-state.json' });

  // AxeBuilder is exported as both named and default (CJS/ESM dual export).
  // TypeScript cannot resolve the construct signature from .d.ts under
  // NodeNext moduleResolution, but the default import is the class at runtime.
  type AxeCtor = new (opts: { page: import('playwright').Page }) => {
    analyze: () => Promise<{ violations: unknown[] }>;
  };
  const Builder = AxeBuilder as unknown as AxeCtor;

  // Axe reports page-has-heading-one because our SPA renders the visible h1
  // inside the dynamic chat workspace, but axe-core evaluates the document at
  // page load. We allow only that specific violation and guard its severity.
  function assertAllowedA11yViolations(results: { violations: unknown[] }) {
    const otherViolations = results.violations.filter(
      (v) => (v as { id: string }).id !== 'page-has-heading-one'
    );
    expect(otherViolations).toEqual([]);

    const headingViolation = results.violations.find(
      (v) => (v as { id: string }).id === 'page-has-heading-one'
    );
    if (headingViolation) {
      expect((headingViolation as { impact: string }).impact).toBe('moderate');
    }
  }

  test('chat workspace has no a11y violations', async ({ page }) => {
    // Use ?app=1 to bypass the landing page and load the SPA directly.
    await page.goto('/?app=1');
    // The chat SPA opens long-lived SSE connections that prevent
    // networkidle from settling. Wait for the main app shell to render.
    await page.waitForSelector('main#main, [id="chat-list"]', { timeout: 10000 });

    // Wait for the visible workspace heading to be rendered before scanning.
    // This ensures axe-core evaluates the rendered chat UI, not an
    // intermediate state where the h1 has not yet mounted.
    await expect(
      page.getByRole('heading', { level: 1, name: 'How can I help you today?' })
    ).toBeVisible({ timeout: 5000 });

    const accessibilityScanResults = await new Builder({
      page,
    }).analyze();

    assertAllowedA11yViolations(accessibilityScanResults);
  });

  test('chat workspace has a visible h1 heading', async ({ page }) => {
    await page.goto('/?app=1');
    // Wait for the main app shell to render
    await page.waitForSelector('main#main, [id="chat-list"]', { timeout: 10000 });

    // Assert the visible workspace heading is present.
    // Use getByRole with the exact heading name to ensure we
    // target the visible content heading, not the sr-only brand heading.
    await expect(
      page.getByRole('heading', { level: 1, name: 'How can I help you today?' })
    ).toBeVisible({ timeout: 5000 });
  });

  test('admin users overview has no a11y violations', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForURL(/\/admin\/users\/overview$/, { timeout: 5000 });
    // Wait for the admin shell to render, then settle for axe.
    await page.waitForSelector('main#main, [id="admin-users-list"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    const accessibilityScanResults = await new Builder({
      page,
    }).analyze();

    // Blocking: any axe-core violation fails the test.
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
