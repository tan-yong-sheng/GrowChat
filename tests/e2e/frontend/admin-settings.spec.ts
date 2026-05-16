import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (!email || !password) throw new Error("TEST_EMAIL and TEST_PASSWORD must be set");

  await page.goto('/auth.html');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
});

test('can revoke an active session', async ({ page }) => {
  // Mock sessions API
  await page.route('**/api/user/sessions', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        sessions: [
          { id: 'session-1', device: 'Chrome on Windows', ip: '127.0.0.1', lastActive: Math.floor(Date.now() / 1000) - 60 },
          { id: 'session-2', device: 'Safari on iPhone', ip: '127.0.0.1', lastActive: Math.floor(Date.now() / 1000) - 3600 }
        ]
      }
    });
  });

  // Mock session revocation API
  await page.route('**/api/user/sessions/session-1', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 200, json: { message: 'Session revoked successfully' } });
    } else {
      await route.continue();
    }
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  // Navigate to Settings > Sessions
  await page.locator('.user-profile-btn').click();
  await page.locator('.menu-item[data-action="preferences"]').click();
  
  const sessionTab = page.locator('[data-subnav="sessions"]').first();
  await expect(sessionTab).toBeVisible({ timeout: 10000 });
  await sessionTab.click();
  
  // Wait for session cards to appear
  const session1 = page.locator('.session-card[data-session-id="session-1"]');
  await expect(session1).toBeVisible();
  
  // Trigger revocation
  // Need to mock the window.confirm
  page.on('dialog', dialog => dialog.accept());
  await session1.locator('.revoke-btn').click();
  
  // Verify card removed
  await expect(session1).not.toBeVisible();
});
