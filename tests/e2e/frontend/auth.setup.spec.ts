import { test as setup } from '@playwright/test';

const authFile = 'tests/e2e/fixtures/auth-state.json';

setup('authenticate', async ({ page }) => {
  // Navigate to auth page
  await page.goto('/auth.html');
  await page.waitForLoadState('domcontentloaded');

  // Fill login form
  const email = process.env.TEST_EMAIL;
  if (!email) throw new Error('TEST_EMAIL is required');
  await page.locator('#email').fill(email);

  const password = process.env.TEST_PASSWORD;
  if (!password) throw new Error('TEST_PASSWORD is required');
  await page.locator('#password').fill(password);

  // Submit login
  await page.locator('#auth-submit').click();

  // Wait for the authenticated UI to appear (proves login succeeded AND token is in localStorage).
  // This is more reliable than waitForURL since the landing page may chain redirects (/ → /?app=1).
  await page.locator('.user-profile-btn').waitFor({ state: 'visible', timeout: 15000 });

  // Small delay to ensure localStorage is fully written before capturing state
  await page.waitForTimeout(500);

  // Save auth state
  await page.context().storageState({ path: authFile });
});
