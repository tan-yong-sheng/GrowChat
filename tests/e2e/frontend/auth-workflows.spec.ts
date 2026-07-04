import { test, expect } from '@playwright/test';

test.describe('Auth Workflows QA', () => {
  test('Email Verification - Pending State', async ({ page }) => {
    // Navigate to /verify without a token
    await page.goto('/verify?email=test@example.com');

    // Should show the pending screen
    await expect(page.locator('text=Check your email')).toBeVisible();
    await expect(page.locator('text=test@example.com')).toBeVisible();

    // Resend button should initially be disabled
    const resendBtn = page.locator('button', { hasText: 'Resend email' });
    await expect(resendBtn).toBeDisabled();

    // Continue button should be present and styled with primary color
    const continueBtn = page.locator('button', { hasText: "I've verified my email" });
    await expect(continueBtn).toBeVisible();
    await expect(continueBtn).toHaveClass(/btn-primary/);
  });

  test('Password Reset - Modal Activation', async ({ page }) => {
    // Navigate to auth page with a reset token
    await page.goto('/auth.html?token=dummy-reset-token');

    // The reset password modal should automatically open
    const modal = page.locator('#reset-password-modal');
    await expect(modal).not.toHaveClass(/hidden/);

    // Should show the reset password form
    await expect(page.locator('h2', { hasText: 'Create new password' })).toBeVisible();

    // Submit button should be styled with the primary action color
    const submitBtn = page.locator('#reset-submit');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toHaveClass(/bg-\[\#171717\]/);
  });

  test('Forgot Password - Hidden when email not configured', async ({ page }) => {
    await page.goto('/auth.html');

    // When no email provider is configured, the forgot-password button
    // is hidden by the bootstrap state check (emailConfigured === false)
    const forgotPasswordBtn = page.locator('#forgot-password');
    await expect(forgotPasswordBtn).toHaveAttribute('aria-hidden', 'true');
    await expect(forgotPasswordBtn).toHaveClass(/hidden/);

    // The modal should also remain hidden
    const modal = page.locator('#forgot-password-modal');
    await expect(modal).toHaveClass(/hidden/);
  });

  test('Login flow with provided credentials', async ({ page }) => {
    await page.goto('/auth.html');

    const testUser = process.env.TEST_EMAIL;
    const testPassword = process.env.TEST_PASSWORD;

    test.skip(
      !testUser || !testPassword,
      'TEST_USER and TEST_PASSWORD env vars are required for this test'
    );

    // Fill credentials
    await page.fill('#email', testUser);
    await page.fill('#password', testPassword);

    // Submit
    await page.click('#auth-submit');

    // Expect to be redirected
    await expect(page).not.toHaveURL(/.*auth\.html.*/);
  });
});
