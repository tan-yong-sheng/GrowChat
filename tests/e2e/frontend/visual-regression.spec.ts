import { test, expect } from '@playwright/test';

test.describe('Visual Regression - Auth Pages', () => {
  test('auth login page matches baseline (desktop)', async ({ page }) => {
    await page.goto('/auth.html');
    await page.waitForLoadState('networkidle');
    await page.locator('#auth-submit').waitFor({ state: 'visible' });
    await expect(page).toHaveScreenshot('auth-login-desktop.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('auth login page matches baseline (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/auth.html');
    await page.waitForLoadState('networkidle');
    await page.locator('#auth-submit').waitFor({ state: 'visible' });
    await expect(page).toHaveScreenshot('auth-login-mobile.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });
});

test.describe('Visual Regression - Chat', () => {
  test.use({ storageState: 'tests/e2e/fixtures/auth-state.json' });

  test('chat list page matches baseline (desktop)', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#sidebar').waitFor({ state: 'visible' });
    await expect(page).toHaveScreenshot('chat-list-desktop.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('chat list page matches baseline (mobile)', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#sidebar').waitFor({ state: 'visible' });
    await expect(page).toHaveScreenshot('chat-list-mobile.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });
});

test.describe('Visual Regression - Admin', () => {
  test.use({ storageState: 'tests/e2e/fixtures/auth-state.json' });

  test('admin settings page matches baseline (desktop)', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/admin/settings');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#manage-connections-section').waitFor({ state: 'visible' });
    await expect(page).toHaveScreenshot('admin-settings-desktop.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('admin settings page matches baseline (mobile)', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin/settings');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#manage-connections-section').waitFor({ state: 'visible' });
    await expect(page).toHaveScreenshot('admin-settings-mobile.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });
});
