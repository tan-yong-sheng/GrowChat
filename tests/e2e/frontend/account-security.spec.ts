import { test, expect } from '@playwright/test';

const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;

test.describe('Account Security', () => {
  test.beforeEach(async ({ page }) => {
    if (!email || !password) {
      test.skip(true, 'TEST_EMAIL and TEST_PASSWORD must be set for auth e2e');
    }
    // Navigate to the account settings page
    await page.goto('/account/settings/security');
    await page.waitForLoadState('networkidle');
  });

  test('change password form renders with all fields', async ({ page }) => {
    // Verify the form is visible
    await expect(page.locator('#change-password-form')).toBeVisible({ timeout: 10000 });

    // Verify all three password fields are present
    await expect(page.locator('#current-password')).toBeVisible();
    await expect(page.locator('#new-password')).toBeVisible();
    await expect(page.locator('#confirm-password')).toBeVisible();

    // Verify the submit button
    await expect(page.locator('#change-password-form button[type="submit"]')).toBeVisible();
  });

  test('rejects mismatched new passwords with client-side validation', async ({ page }) => {
    // Fill in the form with mismatched passwords
    await page.locator('#current-password').fill(password);
    await page.locator('#new-password').fill('new-password-8');
    await page.locator('#confirm-password').fill('different-confirm-8');

    // Submit the form
    await page.locator('#change-password-form button[type="submit"]').click();

    // Wait for client-side validation feedback
    await expect(page.locator('#password-change-feedback')).toHaveText(
      /New passwords do not match/i
    );
  });

  test('rejects too-short new password with client-side validation', async ({ page }) => {
    await page.locator('#current-password').fill(password);
    await page.locator('#new-password').fill('short');
    await page.locator('#confirm-password').fill('short');

    // Clear any previous feedback
    const existing = page.locator('#password-change-feedback');
    if (await existing.isVisible().catch(() => false)) {
      await existing.waitFor({ state: 'hidden' });
    }

    await page.locator('#change-password-form button[type="submit"]').click();

    // Wait for client-side validation feedback
    await expect(page.locator('#password-change-feedback')).toHaveText(
      /must be at least 8 characters/i
    );
  });

  test('successful password change shows success message', async ({ page }) => {
    // Mock the API route so the test doesn't require a real backend
    await page.route('**/api/auth/change-password', async (route) => {
      await route.fulfill({
        status: 200,
        json: { message: 'Password changed successfully' },
      });
    });

    // Fill in the form
    await page.locator('#current-password').fill(password);
    await page.locator('#new-password').fill('valid-new-password-8');
    await page.locator('#confirm-password').fill('valid-new-password-8');

    // Submit
    await page.locator('#change-password-form button[type="submit"]').click();

    // Wait for success feedback
    await expect(page.locator('#password-change-feedback')).toHaveText(
      /Password changed successfully/i,
      { timeout: 10000 }
    );
  });

  test('shows error message when current password is wrong', async ({ page }) => {
    // Mock the API to return 401
    await page.route('**/api/auth/change-password', async (route) => {
      await route.fulfill({
        status: 401,
        json: { error: 'Current password is incorrect' },
      });
    });

    // Fill in the form
    await page.locator('#current-password').fill('wrong-current-password');
    await page.locator('#new-password').fill('valid-new-password-8');
    await page.locator('#confirm-password').fill('valid-new-password-8');

    // Submit
    await page.locator('#change-password-form button[type="submit"]').click();

    // Wait for error feedback
    await expect(page.locator('#password-change-feedback')).toHaveText(
      /Current password is incorrect/i,
      { timeout: 10000 }
    );
  });

  test('clears form fields after successful password change', async ({ page }) => {
    // Mock the API
    await page.route('**/api/auth/change-password', async (route) => {
      await route.fulfill({
        status: 200,
        json: { message: 'Password changed successfully' },
      });
    });

    // Fill in the form
    await page.locator('#current-password').fill(password);
    await page.locator('#new-password').fill('valid-new-password-8');
    await page.locator('#confirm-password').fill('valid-new-password-8');

    // Submit
    await page.locator('#change-password-form button[type="submit"]').click();

    // Wait for success feedback
    await expect(page.locator('#password-change-feedback')).toHaveText(
      /Password changed successfully/i,
      { timeout: 10000 }
    );

    // Verify form fields are cleared
    await expect(page.locator('#current-password')).toHaveValue('');
    await expect(page.locator('#new-password')).toHaveValue('');
    await expect(page.locator('#confirm-password')).toHaveValue('');
  });
});