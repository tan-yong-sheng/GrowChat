import { expect, test } from '@playwright/test';
import { setupAdminPage } from './admin-test-helpers';

test.describe('Debug App Bootstrap Smoke', () => {
  test('authenticated app renders without page errors', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error);
    });

    await setupAdminPage(page);
    await page.goto('/');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#message-input-container')).toBeVisible({ timeout: 15000 });
    expect(pageErrors).toEqual([]);
  });
});
