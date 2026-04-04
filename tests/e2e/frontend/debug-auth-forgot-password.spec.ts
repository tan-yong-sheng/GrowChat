import { test, expect } from '@playwright/test';

test.describe('Auth Page - Forgot Password Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth.html');
    await page.waitForSelector('#auth-title', { state: 'visible', timeout: 10000 });
  });

  test('forgot-password button is visible in login mode', async ({ page }) => {
    const forgotPasswordBtn = page.locator('#forgot-password');
    await expect(forgotPasswordBtn).toBeVisible();
    await expect(forgotPasswordBtn).toHaveText('Forgot password?');
  });

  test('forgot-password modal opens when button is clicked', async ({ page }) => {
    const forgotPasswordBtn = page.locator('#forgot-password');
    const modal = page.locator('#forgot-password-modal');

    await expect(modal).toHaveClass(/hidden/);
    await forgotPasswordBtn.click();
    await expect(modal).not.toHaveClass(/hidden/);
  });

  test('forgot-password modal contains email input', async ({ page }) => {
    const forgotPasswordBtn = page.locator('#forgot-password');
    const emailInput = page.locator('#forgot-email');

    await forgotPasswordBtn.click();
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('type', 'email');
  });

  test('forgot-password modal can be closed', async ({ page }) => {
    const forgotPasswordBtn = page.locator('#forgot-password');
    const modal = page.locator('#forgot-password-modal');
    const closeBtn = page.locator('#modal-close');

    await forgotPasswordBtn.click();
    await expect(modal).not.toHaveClass(/hidden/);
    await closeBtn.click();
    await expect(modal).toHaveClass(/hidden/);
  });

  test('forgot-password form submission sends email', async ({ page }) => {
    const forgotPasswordBtn = page.locator('#forgot-password');
    const emailInput = page.locator('#forgot-email');
    const submitBtn = page.locator('#forgot-submit');

    let requestMade = false;
    await page.route('/api/auth/forgot-password', async (route) => {
      requestMade = true;
      const postData = route.request().postDataJSON();
      expect(postData.email).toBe('test@example.com');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Reset link sent' }),
      });
    });

    await forgotPasswordBtn.click();
    await emailInput.fill('test@example.com');
    await submitBtn.click();

    await page.waitForTimeout(100);
    expect(requestMade).toBe(true);
  });

  test('reset-password modal opens with valid token in URL', async ({ page }) => {
    await page.goto('/auth.html?token=valid-reset-token');
    const modal = page.locator('#reset-password-modal');
    await expect(modal).not.toHaveClass(/hidden/);
  });

  test('reset-password form validates password match', async ({ page }) => {
    await page.goto('/auth.html?token=valid-reset-token');
    const newPasswordInput = page.locator('#new-password');
    const confirmPasswordInput = page.locator('#confirm-password');
    const submitBtn = page.locator('#reset-submit');
    const errorMsg = page.locator('#reset-error');

    await newPasswordInput.fill('password123');
    await confirmPasswordInput.fill('password456');
    await submitBtn.click();

    await expect(errorMsg).not.toHaveClass(/hidden/);
    await expect(errorMsg).toContainText('do not match');
  });

  test('reset-password form validates minimum length', async ({ page }) => {
    await page.goto('/auth.html?token=valid-reset-token');
    const newPasswordInput = page.locator('#new-password');
    const confirmPasswordInput = page.locator('#confirm-password');
    const submitBtn = page.locator('#reset-submit');
    const errorMsg = page.locator('#reset-error');

    await newPasswordInput.fill('short');
    await confirmPasswordInput.fill('short');
    await submitBtn.click();

    await expect(errorMsg).not.toHaveClass(/hidden/);
    await expect(errorMsg).toContainText('at least 8 characters');
  });

  test('login form still works with forgot-password modal', async ({ page }) => {
    const mockAuthResponse = {
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      user: { id: '1', name: 'Test User', email: 'test@example.com' }
    };

    await page.route('/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAuthResponse),
      });
    });

    await page.route('/', async (route) => {
      await route.fulfill({ status: 200, body: '<html><body>Main App</body></html>' });
    });

    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'correctpassword');
    await page.click('#auth-submit');

    await page.waitForURL('**/');
    const authState = await page.evaluate(() => JSON.parse(localStorage.getItem('growchat_auth')));
    expect(authState).toEqual(mockAuthResponse);
  });

  test('register form still works after toggling from login', async ({ page }) => {
    await page.click('#toggle-mode');

    const mockAuthResponse = {
      access_token: 'new-token',
      refresh_token: 'new-refresh',
      user: { id: '2', name: 'New User', email: 'new@example.com' }
    };

    await page.route('/api/auth/register', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAuthResponse),
      });
    });

    await page.route('/', async (route) => {
      await route.fulfill({ status: 200, body: '<html><body>Main App</body></html>' });
    });

    await page.fill('#name', 'New User');
    await page.fill('#email', 'new@example.com');
    await page.fill('#password', 'password123');
    await page.click('#auth-submit');

    await page.waitForURL('**/');
    const authState = await page.evaluate(() => JSON.parse(localStorage.getItem('growchat_auth')));
    expect(authState).toEqual(mockAuthResponse);
  });
});

