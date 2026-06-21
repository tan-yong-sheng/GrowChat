import { test as setup } from '@playwright/test';

const authFile = 'tests/e2e/fixtures/auth-state.json';

setup('authenticate', async ({ page }) => {
  // Navigate to auth page
  await page.goto('/auth.html');
  
  // Fill login form
  await page.locator('#email').fill(process.env.TEST_EMAIL || 'admin@localhost');
  await page.locator('#password').fill(process.env.TEST_PASSWORD || 'admin123');
  
  // Submit login
  await page.locator('#auth-submit').click();
  
  // Wait for redirect to chat list
  await page.waitForURL('/', { timeout: 10000 });
  
  // Save auth state
  await page.context().storageState({ path: authFile });
});
