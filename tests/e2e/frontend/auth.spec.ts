import { test, expect } from '@playwright/test';

const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;

test('login with valid credentials', async ({ page }) => {
  if (!email || !password) {
    test.skip(true, 'TEST_EMAIL and TEST_PASSWORD must be set for auth e2e');
  }
  await page.goto('/auth.html');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#auth-title')).toHaveText('Sign in to GrowChat');

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#auth-submit').click();

  // Don't use waitForURL('/') — the landing page immediately redirects to /?app=1
  // client-side, causing a race. Instead, wait directly for the authenticated UI.
  await expect(page.locator('.user-profile-btn')).toBeVisible({
    timeout: 15000,
  });
});


