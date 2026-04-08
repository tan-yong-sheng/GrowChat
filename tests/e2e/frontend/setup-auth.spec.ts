import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8787';
const TEST_EMAIL = 'tys203831@gmail.com';
const TEST_PASSWORD = '&Test1234';

test('Setup: Create auth state', async ({ page }) => {
  // Navigate to auth page
  await page.goto(`${BASE_URL}/auth.html`);

  // Wait for page to load
  await page.waitForLoadState('networkidle');

  // Try to find and fill the email input
  const emailInput = page.locator('input#email');
  const passwordInput = page.locator('input#password');

  await emailInput.fill(TEST_EMAIL);
  await passwordInput.fill(TEST_PASSWORD);

  // Find and click the login button
  const loginBtn = page.locator('button').filter({ hasText: /^(Login|Sign in)$/i }).first();
  await loginBtn.click();

  // Wait for navigation
  await page.waitForURL(`${BASE_URL}/`, { timeout: 15000 });

  // Wait for app to be ready
  await page.waitForLoadState('networkidle');

  // Save storage state
  await page.context().storageState({ path: 'tests/e2e/fixtures/auth-state.json' });

  console.log('Auth state saved successfully');
});
