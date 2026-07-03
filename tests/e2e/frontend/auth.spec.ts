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
  // Register the response waiter BEFORE navigating, so it doesn't
  // miss the fulfillment if the route handles it synchronously.
  // Then short-delay the route to ensure loading state is visible.
  // Use a 50ms delay to let the SPA mount the loading state before
  // the response arrives.
  const responsePromise = page.waitForResponse('**/api/auth/verify-email*');

  await page.route('**/api/auth/verify-email*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await route.fulfill({ status: 200, json: { success: true } });
  });

  // Navigate to the verify page. The SPA boots and makes the API call
  // (with a 50ms route delay), so the loading state renders and stays
  // visible while the response is in-flight.
  await page.goto('/verify?token=test-token');

  // Wait for the loading heading to appear during the 50ms delay.
  await expect(page.locator('text=Verifying your email')).toBeVisible({ timeout: 5000 });

  await responsePromise;

  // After the response, assert the verification success state.
  await expect(page.locator('text=Email verified!')).toBeVisible({ timeout: 5000 });
});
