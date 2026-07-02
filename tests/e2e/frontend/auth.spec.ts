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

test('navigating to /verify loads verification UI', async ({ page }) => {
  await page.route('**/api/auth/verify-email*', async (route) => {
    await route.fulfill({ status: 200, json: { success: true } });
  });

  await page.goto('/verify?token=test-token');

  // Wait for the API response to settle before checking the DOM.
  // The route handler resolves immediately (no artificial delay),
  // so the success state replaces the loading UI. Use waitForResponse
  // to gate on the network request, then assert the success card.
  const responsePromise = page.waitForResponse('**/api/auth/verify-email*');
  await responsePromise;

  // After the response, assert the verification success state.
  await expect(page.locator('text=Email verified!')).toBeVisible({ timeout: 5000 });
});
