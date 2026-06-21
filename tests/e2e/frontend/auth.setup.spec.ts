import { test as setup } from '@playwright/test';

const authFile = 'tests/e2e/fixtures/auth-state.json';

setup('authenticate', async ({ page }) => {
  // Navigate to auth page
  await page.goto('/auth.html');

  // Fill login form
  const email = process.env.TEST_EMAIL;
  if (!email) throw new Error('TEST_EMAIL is required');
  await page.locator('#email').fill(email);

  const password = process.env.TEST_PASSWORD;
  if (!password) throw new Error('TEST_PASSWORD is required');
  await page.locator('#password').fill(password);

  // Submit login
  await page.locator('#auth-submit').click();

  // Wait for redirect to chat list
  await page.waitForURL('/', { timeout: 10000 });

  // Save auth state
  await page.context().storageState({ path: authFile });
});
