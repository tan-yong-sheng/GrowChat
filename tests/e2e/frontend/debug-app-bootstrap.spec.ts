import { expect, test } from '@playwright/test';

test.describe('Debug App Bootstrap Smoke', () => {
  test('authenticated app on localhost:8787 renders without page errors', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error);
    });

    await page.goto('/auth');
    await page.fill('#email', 'tys203831@gmail.com');
    await page.fill('#password', '&Test1234');
    await page.click('#auth-submit');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#message-input-container')).toBeVisible({ timeout: 15000 });
    expect(pageErrors).toEqual([]);
  });
});
